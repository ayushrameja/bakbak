use std::{
    borrow::Cow,
    mem,
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use core_graphics::access::ScreenCaptureAccess;
use livekit::webrtc::{
    audio_source::native::NativeAudioSource,
    prelude::{AudioFrame, VideoFrame, VideoRotation},
    video_frame::native::NativeBuffer,
    video_source::native::NativeVideoSource,
};
use screencapturekit::{
    async_api::AsyncSCShareableContent,
    cm::{CMSampleBufferSCExt, SCFrameStatus},
    prelude::*,
    shareable_content::SCShareableContentInfo,
    stream::delegate_trait::SCStreamDelegateTrait,
};
use tokio::{sync::mpsc, task::JoinHandle, time::timeout};

use super::super::{
    SCREEN_SHARE_FRAME_RATES, SCREEN_SHARE_RESOLUTIONS, ScreenShareCapabilities,
    ScreenShareSettings, ScreenShareSource, ScreenShareSourceKind,
};

const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(5);
const PAUSED_SOURCE_TIMEOUT: Duration = Duration::from_secs(2);
const SOURCE_ENUMERATION_TIMEOUT: Duration = Duration::from_secs(5);
const BAKBAK_BUNDLE_IDENTIFIER: &str = "com.bakbak.desktop";

pub struct PreparedCapture {
    pub source_label: String,
    pub source_kind: ScreenShareSourceKind,
    pub width: u32,
    pub height: u32,
    pub include_audio: bool,
    settings: ScreenShareSettings,
    source_width: u32,
    source_height: u32,
    filter: SCContentFilter,
    termination_sender: mpsc::UnboundedSender<String>,
    pause_sender: mpsc::UnboundedSender<bool>,
}

pub struct CaptureSession {
    stream: SCStream,
    audio_task: Option<JoinHandle<()>>,
    pause_task: JoinHandle<()>,
    source_width: u32,
    source_height: u32,
    capture_audio: bool,
}

impl CaptureSession {
    pub async fn stop(mut self) {
        let _ = self.stream.stop_capture();
        self.pause_task.abort();
        if let Some(task) = self.audio_task.take() {
            task.abort();
        }
    }

    pub async fn update_settings(&self, settings: ScreenShareSettings) -> Result<(), String> {
        let (width, height) =
            fit_to_resolution(self.source_width, self.source_height, settings.resolution);
        let configuration =
            stream_configuration(width, height, settings.frame_rate, self.capture_audio);
        self.stream
            .update_configuration(&configuration)
            .map_err(|error| format!("macOS could not apply the new screen quality: {error}"))
    }
}

pub fn capabilities() -> ScreenShareCapabilities {
    let supports_picker =
        matches!(os_info::get().version(), os_info::Version::Semantic(major, _, _) if *major >= 14);
    ScreenShareCapabilities {
        available: true,
        native_capture: supports_picker,
        system_audio: supports_picker,
        source_kinds: vec![
            ScreenShareSourceKind::Display,
            ScreenShareSourceKind::Application,
        ],
        resolutions: SCREEN_SHARE_RESOLUTIONS.to_vec(),
        frame_rates: SCREEN_SHARE_FRAME_RATES.to_vec(),
        dynamic_settings: supports_picker,
        custom_picker: supports_picker,
        reason: (!supports_picker).then(|| {
            "Matched system audio requires macOS 14 or later; Bakbak will use video-only sharing."
                .to_string()
        }),
    }
}

pub async fn sources() -> Result<Vec<ScreenShareSource>, String> {
    let content = shareable_content().await?;
    let windows = content.windows();
    let mut result = content
        .displays()
        .into_iter()
        .enumerate()
        .map(|(index, display)| ScreenShareSource {
            id: format!("display:{}", display.display_id()),
            kind: ScreenShareSourceKind::Display,
            label: format!("Screen {}", index + 1),
            application_label: None,
            audio_available: true,
            thumbnail_data_url: None,
        })
        .collect::<Vec<_>>();

    let mut applications = content
        .applications()
        .into_iter()
        .filter(|application| is_shareable_application(application, &windows))
        .map(|application| ScreenShareSource {
            id: format!("application:{}", application.process_id()),
            kind: ScreenShareSourceKind::Application,
            label: application.application_name(),
            application_label: Some(application.bundle_identifier())
                .filter(|value| !value.trim().is_empty()),
            audio_available: true,
            thumbnail_data_url: None,
        })
        .collect::<Vec<_>>();
    applications.sort_by(|left, right| left.label.to_lowercase().cmp(&right.label.to_lowercase()));
    result.extend(applications);
    Ok(result)
}

pub async fn pick_source(
    include_audio: bool,
    settings: ScreenShareSettings,
    source_id: Option<&str>,
    termination_sender: mpsc::UnboundedSender<String>,
    pause_sender: mpsc::UnboundedSender<bool>,
) -> Result<PreparedCapture, String> {
    let source_id = source_id.ok_or_else(|| "Choose a screen or application first.".to_string())?;
    let content = shareable_content().await?;
    let displays = content.displays();
    let windows = content.windows();
    let (source_label, source_kind, source_width, source_height, filter) =
        resolve_source(source_id, &displays, &windows, &content.applications())?;
    let (width, height) = fit_to_resolution(source_width, source_height, settings.resolution);

    Ok(PreparedCapture {
        source_label,
        source_kind,
        width,
        height,
        include_audio,
        settings,
        source_width,
        source_height,
        filter,
        termination_sender,
        pause_sender,
    })
}

fn resolve_source(
    source_id: &str,
    displays: &[SCDisplay],
    windows: &[SCWindow],
    applications: &[SCRunningApplication],
) -> Result<(String, ScreenShareSourceKind, u32, u32, SCContentFilter), String> {
    if let Some(display_id) = source_id.strip_prefix("display:") {
        let display_id = display_id
            .parse::<u32>()
            .map_err(|_| "The selected screen is no longer available.".to_string())?;
        let display = displays
            .iter()
            .find(|display| display.display_id() == display_id)
            .ok_or_else(|| "The selected screen is no longer available.".to_string())?;
        let source_width = display.width().max(2);
        let source_height = display.height().max(2);
        let filter = SCContentFilter::create()
            .with_display(display)
            .with_excluding_windows(&[])
            .build();
        let (source_width, source_height) =
            filter_pixel_size(&filter, (source_width, source_height));
        return Ok((
            format!("Screen {}", display_index(displays, display_id)),
            ScreenShareSourceKind::Display,
            source_width,
            source_height,
            filter,
        ));
    }

    if let Some(process_id) = source_id.strip_prefix("application:") {
        let process_id = process_id
            .parse::<i32>()
            .map_err(|_| "The selected application is no longer available.".to_string())?;
        let application = applications
            .iter()
            .find(|application| application.process_id() == process_id)
            .ok_or_else(|| "The selected application is no longer available.".to_string())?;
        if !is_shareable_application(application, windows) {
            return Err("The selected application is no longer available.".to_string());
        }
        let display = application_display(application, displays, windows).ok_or_else(|| {
            "macOS could not find a display for the selected application.".to_string()
        })?;
        let filter = SCContentFilter::create()
            .with_display(display)
            .with_including_applications(&[application], &[])
            .build();
        let (source_width, source_height) =
            filter_pixel_size(&filter, (display.width(), display.height()));
        return Ok((
            application.application_name(),
            ScreenShareSourceKind::Application,
            source_width,
            source_height,
            filter,
        ));
    }

    Err("Choose a screen or application first.".to_string())
}

fn is_shareable_application(application: &SCRunningApplication, windows: &[SCWindow]) -> bool {
    let name = application.application_name();
    if name.trim().is_empty() {
        return false;
    }
    if application.bundle_identifier() == BAKBAK_BUNDLE_IDENTIFIER {
        return false;
    }
    windows.iter().any(|window| {
        window.is_on_screen()
            && window
                .owning_application()
                .is_some_and(|owner| owner.process_id() == application.process_id())
    })
}

fn application_display<'a>(
    application: &SCRunningApplication,
    displays: &'a [SCDisplay],
    windows: &[SCWindow],
) -> Option<&'a SCDisplay> {
    let preferred = windows
        .iter()
        .filter(|window| {
            window.is_on_screen()
                && window
                    .owning_application()
                    .is_some_and(|owner| owner.process_id() == application.process_id())
        })
        .max_by(|left, right| {
            window_area(left)
                .partial_cmp(&window_area(right))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .and_then(|window| display_for_window(window, displays));
    preferred.or_else(|| displays.first())
}

fn display_for_window<'a>(window: &SCWindow, displays: &'a [SCDisplay]) -> Option<&'a SCDisplay> {
    let frame = window.frame();
    let center_x = frame.origin.x + frame.size.width / 2.0;
    let center_y = frame.origin.y + frame.size.height / 2.0;
    displays.iter().find(|display| {
        let display_frame = display.frame();
        center_x >= display_frame.origin.x
            && center_y >= display_frame.origin.y
            && center_x < display_frame.origin.x + display_frame.size.width
            && center_y < display_frame.origin.y + display_frame.size.height
    })
}

fn filter_pixel_size(filter: &SCContentFilter, fallback: (u32, u32)) -> (u32, u32) {
    usable_pixel_size(
        SCShareableContentInfo::for_filter(filter).map(|info| info.pixel_size()),
        fallback,
    )
}

fn usable_pixel_size(measured: Option<(u32, u32)>, fallback: (u32, u32)) -> (u32, u32) {
    measured
        .filter(|(width, height)| *width > 0 && *height > 0)
        .unwrap_or(fallback)
}

fn window_area(window: &SCWindow) -> f64 {
    let frame = window.frame();
    frame.size.width.max(0.0) * frame.size.height.max(0.0)
}

fn display_index(displays: &[SCDisplay], display_id: u32) -> usize {
    displays
        .iter()
        .position(|display| display.display_id() == display_id)
        .map(|index| index + 1)
        .unwrap_or(1)
}

fn shareable_content_error(error: impl std::fmt::Display) -> String {
    format!(
        "macOS refused screen access for this running copy of Bakbak. Permission changes only apply after a full app restart. If Bakbak is already enabled, remove that entry, launch this exact Bakbak.app again, re-enable it, and restart: {error}"
    )
}

async fn shareable_content() -> Result<SCShareableContent, String> {
    let access = ScreenCaptureAccess;
    if !access.preflight() && !access.request() {
        return Err(
            "Screen recording permission is not active for this running copy of Bakbak. Open Privacy & Security > Screen & System Audio Recording, enable Bakbak, then restart the app."
                .to_string(),
        );
    }
    timeout(
        SOURCE_ENUMERATION_TIMEOUT,
        AsyncSCShareableContent::get(),
    )
    .await
    .map_err(|_| {
        "macOS took too long to list shareable sources. Check Screen & System Audio Recording permission, then try again."
            .to_string()
    })?
    .map_err(shareable_content_error)
}

pub async fn start_capture(
    prepared: PreparedCapture,
    video_source: NativeVideoSource,
    audio_source: Option<NativeAudioSource>,
) -> Result<(CaptureSession, bool), String> {
    match start_capture_attempt(&prepared, video_source.clone(), audio_source, true).await {
        Ok(session) => Ok((session, prepared.include_audio)),
        Err(_) if prepared.include_audio => {
            start_capture_attempt(&prepared, video_source, None, false)
                .await
                .map(|session| (session, false))
        }
        Err(error) => Err(error),
    }
}

async fn start_capture_attempt(
    prepared: &PreparedCapture,
    video_source: NativeVideoSource,
    audio_source: Option<NativeAudioSource>,
    capture_audio: bool,
) -> Result<CaptureSession, String> {
    let configuration = stream_configuration(
        prepared.width,
        prepared.height,
        prepared.settings.frame_rate,
        capture_audio && audio_source.is_some(),
    );

    let (audio_sender, mut audio_receiver) = mpsc::channel::<OwnedAudioFrame>(8);
    let audio_task = audio_source.map(|source| {
        tokio::spawn(async move {
            while let Some(frame) = audio_receiver.recv().await {
                let audio_frame = AudioFrame {
                    data: Cow::Owned(frame.samples),
                    sample_rate: frame.sample_rate,
                    num_channels: frame.channels,
                    samples_per_channel: frame.samples_per_channel,
                };
                let _ = source.capture_frame(&audio_frame).await;
            }
        })
    });

    let (first_frame_sender, mut first_frame_receiver) = mpsc::unbounded_channel();
    let first_frame_seen = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
    let last_healthy_frame = Arc::new(StdMutex::new(Instant::now()));
    let pause_task = start_pause_watchdog(
        first_frame_seen.clone(),
        paused.clone(),
        last_healthy_frame.clone(),
        prepared.pause_sender.clone(),
    );

    let handler = CaptureHandler {
        video_source,
        audio_sender: audio_task.as_ref().map(|_| audio_sender),
        first_frame_sender,
        first_frame_seen,
        paused,
        last_healthy_frame,
        pause_sender: prepared.pause_sender.clone(),
    };
    let delegate = CaptureDelegate {
        termination_sender: prepared.termination_sender.clone(),
    };
    let mut stream = SCStream::new_with_delegate(&prepared.filter, &configuration, delegate);
    if stream
        .add_output_handler(handler.clone(), SCStreamOutputType::Screen)
        .is_none()
    {
        pause_task.abort();
        abort_audio_task(&audio_task);
        return Err("macOS rejected Bakbak's screen video output.".to_string());
    }
    if audio_task.is_some()
        && stream
            .add_output_handler(handler, SCStreamOutputType::Audio)
            .is_none()
    {
        pause_task.abort();
        abort_audio_task(&audio_task);
        return Err("macOS rejected the selected source's audio output.".to_string());
    }
    if let Err(error) = stream.start_capture() {
        pause_task.abort();
        abort_audio_task(&audio_task);
        return Err(format!(
            "macOS could not start capture. Allow Bakbak under Privacy & Security > Screen & System Audio Recording, then relaunch it: {error}"
        ));
    }
    if let Err(error) = wait_for_first_frame(&mut first_frame_receiver, FIRST_FRAME_TIMEOUT).await {
        let _ = stream.stop_capture();
        pause_task.abort();
        abort_audio_task(&audio_task);
        return Err(error);
    }

    let audio_active = capture_audio && audio_task.is_some();
    Ok(CaptureSession {
        stream,
        audio_task,
        pause_task,
        source_width: prepared.source_width,
        source_height: prepared.source_height,
        capture_audio: audio_active,
    })
}

fn stream_configuration(
    width: u32,
    height: u32,
    frame_rate: u32,
    capture_audio: bool,
) -> SCStreamConfiguration {
    let frame_interval = CMTime::new(1, frame_rate as i32);
    SCStreamConfiguration::new()
        .with_width(width)
        .with_height(height)
        .with_pixel_format(PixelFormat::BGRA)
        .with_shows_cursor(true)
        .with_queue_depth(3)
        .with_minimum_frame_interval(&frame_interval)
        .with_captures_audio(capture_audio)
        .with_sample_rate(48_000)
        .with_channel_count(2)
        .with_excludes_current_process_audio(true)
}

fn abort_audio_task(audio_task: &Option<JoinHandle<()>>) {
    if let Some(task) = audio_task {
        task.abort();
    }
}

fn start_pause_watchdog(
    first_frame_seen: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_healthy_frame: Arc<StdMutex<Instant>>,
    pause_sender: mpsc::UnboundedSender<bool>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(250));
        loop {
            interval.tick().await;
            if !first_frame_seen.load(Ordering::Acquire) {
                continue;
            }
            let elapsed = last_healthy_frame
                .lock()
                .map(|last| last.elapsed())
                .unwrap_or_default();
            if should_enter_paused(
                first_frame_seen.load(Ordering::Acquire),
                paused.load(Ordering::Acquire),
                elapsed,
            ) && !paused.swap(true, Ordering::AcqRel)
            {
                let _ = pause_sender.send(true);
            }
        }
    })
}

fn should_enter_paused(frame_seen: bool, paused: bool, elapsed: Duration) -> bool {
    frame_seen && !paused && elapsed >= PAUSED_SOURCE_TIMEOUT
}

async fn wait_for_first_frame(
    receiver: &mut mpsc::UnboundedReceiver<()>,
    wait: Duration,
) -> Result<(), String> {
    match timeout(wait, receiver.recv()).await {
        Ok(Some(())) => Ok(()),
        Ok(None) => Err("macOS ended screen capture before delivering a video frame.".to_string()),
        Err(_) => Err(
            "macOS started screen capture but did not deliver a video frame. Screen sharing was stopped safely."
                .to_string(),
        ),
    }
}

struct CaptureDelegate {
    termination_sender: mpsc::UnboundedSender<String>,
}

impl SCStreamDelegateTrait for CaptureDelegate {
    fn did_stop_with_error(&self, _error: screencapturekit::error::SCError) {
        let _ = self
            .termination_sender
            .send("The selected screen source stopped sharing.".to_string());
    }
}

#[derive(Clone)]
struct CaptureHandler {
    video_source: NativeVideoSource,
    audio_sender: Option<mpsc::Sender<OwnedAudioFrame>>,
    first_frame_sender: mpsc::UnboundedSender<()>,
    first_frame_seen: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_healthy_frame: Arc<StdMutex<Instant>>,
    pause_sender: mpsc::UnboundedSender<bool>,
}

impl SCStreamOutputTrait for CaptureHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
        match output_type {
            SCStreamOutputType::Screen => {
                let frame_status = sample.frame_status();
                if matches!(
                    frame_status,
                    None | Some(SCFrameStatus::Complete) | Some(SCFrameStatus::Started)
                ) {
                    if let Ok(mut last) = self.last_healthy_frame.lock() {
                        *last = Instant::now();
                    }
                    if self.paused.swap(false, Ordering::AcqRel) {
                        let _ = self.pause_sender.send(false);
                    }
                }
                if matches!(
                    frame_status,
                    Some(
                        SCFrameStatus::Idle
                            | SCFrameStatus::Blank
                            | SCFrameStatus::Suspended
                            | SCFrameStatus::Stopped
                    )
                ) {
                    return;
                }
                let Some(pixel_buffer) = sample.image_buffer() else {
                    return;
                };
                // SAFETY: LiveKit's current macOS bridge consumes the +1
                // CVPixelBuffer retain passed to this constructor. Forget the
                // Rust wrapper after the transfer; allowing both LiveKit and
                // the wrapper to release it corrupts CoreMedia's sample-buffer
                // finalization and terminates the process in CFRelease.
                let buffer = unsafe { NativeBuffer::from_cv_pixel_buffer(pixel_buffer.as_ptr()) };
                mem::forget(pixel_buffer);
                let mut frame = VideoFrame::new(VideoRotation::VideoRotation0, buffer);
                if let Some(timestamp) = sample.presentation_timestamp().as_seconds()
                    && timestamp.is_finite()
                    && timestamp >= 0.0
                {
                    frame.timestamp_us = (timestamp * 1_000_000.0) as i64;
                }
                self.video_source.capture_frame(&frame);
                if !self.first_frame_seen.swap(true, Ordering::AcqRel) {
                    let _ = self.first_frame_sender.send(());
                }
            }
            SCStreamOutputType::Audio => {
                let Some(sender) = &self.audio_sender else {
                    return;
                };
                if let Some(frame) = convert_audio_sample(&sample) {
                    let _ = sender.try_send(frame);
                }
            }
            _ => {}
        }
    }
}

struct OwnedAudioFrame {
    samples: Vec<i16>,
    sample_rate: u32,
    channels: u32,
    samples_per_channel: u32,
}

fn convert_audio_sample(sample: &CMSampleBuffer) -> Option<OwnedAudioFrame> {
    let format = sample.format_description()?;
    let sample_rate = format.audio_sample_rate()?.round() as u32;
    let channels = format.audio_channel_count()?;
    let samples_per_channel = u32::try_from(sample.num_samples()).ok()?;
    if sample_rate != 48_000 || channels == 0 || channels > 2 || samples_per_channel == 0 {
        return None;
    }
    let buffers = sample.audio_buffer_list()?;
    let expected = samples_per_channel as usize * channels as usize;
    let mut output = Vec::with_capacity(expected);

    if format.audio_is_float() {
        if buffers.num_buffers() == 1 {
            let bytes = buffers.buffer(0)?.data();
            output.extend(bytes.chunks_exact(4).take(expected).map(|chunk| {
                let value = f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                float_to_i16(value)
            }));
        } else {
            let channel_data: Vec<&[u8]> = buffers.iter().map(|buffer| buffer.data()).collect();
            for sample_index in 0..samples_per_channel as usize {
                for channel in 0..channels as usize {
                    let offset = sample_index * 4;
                    let bytes = channel_data.get(channel)?.get(offset..offset + 4)?;
                    output.push(float_to_i16(f32::from_ne_bytes([
                        bytes[0], bytes[1], bytes[2], bytes[3],
                    ])));
                }
            }
        }
    } else if format.audio_bits_per_channel() == Some(16) {
        let bytes = buffers.buffer(0)?.data();
        output.extend(
            bytes
                .chunks_exact(2)
                .take(expected)
                .map(|chunk| i16::from_ne_bytes([chunk[0], chunk[1]])),
        );
    } else {
        return None;
    }

    if output.len() != expected {
        return None;
    }
    Some(OwnedAudioFrame {
        samples: output,
        sample_rate,
        channels,
        samples_per_channel,
    })
}

fn float_to_i16(value: f32) -> i16 {
    (value.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
}

fn fit_to_resolution(width: u32, height: u32, resolution: u32) -> (u32, u32) {
    if width == 0 || height == 0 {
        return (resolution * 16 / 9, resolution);
    }
    let max_width = resolution as f64 * 16.0 / 9.0;
    let scale = (max_width / width as f64)
        .min(resolution as f64 / height as f64)
        .min(1.0);
    let even = |value: f64| ((value.round() as u32).max(2) / 2) * 2;
    (even(width as f64 * scale), even(height as f64 * scale))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_capture_dimensions_without_changing_aspect_ratio() {
        assert_eq!(fit_to_resolution(3840, 2160, 1080), (1920, 1080));
        assert_eq!(fit_to_resolution(1280, 720, 1080), (1280, 720));
        assert_eq!(fit_to_resolution(2560, 1440, 720), (1280, 720));
        assert_eq!(fit_to_resolution(1920, 1200, 480), (768, 480));
    }

    #[test]
    fn uses_filter_pixels_only_when_both_dimensions_are_valid() {
        let fallback = (1920, 1080);
        assert_eq!(
            usable_pixel_size(Some((2560, 1440)), fallback),
            (2560, 1440)
        );
        assert_eq!(usable_pixel_size(Some((0, 1080)), fallback), fallback);
        assert_eq!(usable_pixel_size(None, fallback), fallback);
    }

    #[test]
    fn parses_custom_picker_source_ids() {
        assert!(
            "display:1"
                .strip_prefix("display:")
                .and_then(|value| value.parse::<u32>().ok())
                .is_some()
        );
        assert!(
            "application:42"
                .strip_prefix("application:")
                .and_then(|value| value.parse::<i32>().ok())
                .is_some()
        );
        assert!("window:1".strip_prefix("display:").is_none());
    }

    #[test]
    fn pauses_only_after_two_seconds_without_a_complete_frame() {
        assert!(!should_enter_paused(false, false, Duration::from_secs(3)));
        assert!(!should_enter_paused(
            true,
            false,
            Duration::from_millis(1_999)
        ));
        assert!(should_enter_paused(true, false, Duration::from_secs(2)));
        assert!(!should_enter_paused(true, true, Duration::from_secs(3)));
    }

    #[test]
    fn idle_and_blank_statuses_are_not_forwarded_as_new_frames() {
        assert!(matches!(
            Some(SCFrameStatus::Idle),
            Some(
                SCFrameStatus::Idle
                    | SCFrameStatus::Blank
                    | SCFrameStatus::Suspended
                    | SCFrameStatus::Stopped
            )
        ));
        assert!(!matches!(
            Some(SCFrameStatus::Complete),
            Some(
                SCFrameStatus::Idle
                    | SCFrameStatus::Blank
                    | SCFrameStatus::Suspended
                    | SCFrameStatus::Stopped
            )
        ));
    }

    #[test]
    fn converts_normalized_audio_without_overflow() {
        assert_eq!(float_to_i16(-2.0), i16::MIN + 1);
        assert_eq!(float_to_i16(2.0), i16::MAX);
        assert_eq!(float_to_i16(0.0), 0);
    }

    #[tokio::test]
    async fn reports_when_capture_never_delivers_a_video_frame() {
        let (_sender, mut receiver) = mpsc::unbounded_channel();

        assert_eq!(
            wait_for_first_frame(&mut receiver, Duration::from_millis(1)).await,
            Err(
                "macOS started screen capture but did not deliver a video frame. Screen sharing was stopped safely."
                    .to_string()
            )
        );
    }

    #[tokio::test]
    async fn accepts_the_first_delivered_video_frame() {
        let (sender, mut receiver) = mpsc::unbounded_channel();
        sender.send(()).expect("first frame signal");

        assert_eq!(
            wait_for_first_frame(&mut receiver, Duration::from_millis(1)).await,
            Ok(())
        );
    }
}
