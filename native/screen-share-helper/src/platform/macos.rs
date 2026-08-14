use std::{
    borrow::Cow,
    collections::HashSet,
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

use super::*;

const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(5);
const PAUSED_SOURCE_TIMEOUT: Duration = Duration::from_secs(2);
const SOURCE_ENUMERATION_TIMEOUT: Duration = Duration::from_secs(5);

pub struct PreparedCapture {
    metadata: PreparedMetadata,
    settings: CaptureSettings,
    source_width: u32,
    source_height: u32,
    filter: SCContentFilter,
    source_id: String,
    host: HostIdentity,
    events: CaptureEventSender,
}

impl PreparedCapture {
    pub fn metadata(&self) -> PreparedMetadata {
        self.metadata.clone()
    }

    pub fn includes_audio(&self) -> bool {
        self.metadata.audio_requested
    }
}

pub struct CaptureSession {
    stream: SCStream,
    audio_task: Option<JoinHandle<()>>,
    pause_task: JoinHandle<()>,
    topology_task: Option<JoinHandle<()>>,
    audio_enabled: Arc<AtomicBool>,
    settings: StdMutex<CaptureSettings>,
    source_width: u32,
    source_height: u32,
}

impl CaptureSession {
    pub async fn stop(mut self) {
        self.audio_enabled.store(false, Ordering::Release);
        let _ = self.stream.stop_capture();
        self.pause_task.abort();
        if let Some(task) = self.audio_task.take() {
            task.abort();
        }
        if let Some(task) = self.topology_task.take() {
            task.abort();
        }
    }

    pub async fn stop_audio(&mut self) {
        // Stop forwarding first so isolation loss is fail-closed even if
        // ScreenCaptureKit rejects the live configuration update.
        self.audio_enabled.store(false, Ordering::Release);
        if let Some(task) = self.audio_task.take() {
            task.abort();
        }
        if let Some(task) = self.topology_task.take() {
            task.abort();
        }
        let settings = *self
            .settings
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let (width, height) = fit_to_bounds(
            self.source_width,
            self.source_height,
            settings.width,
            settings.height,
        );
        // Reconfigure the same video stream with capturesAudio disabled. This
        // leaves video publication and its current quality untouched while
        // stopping ScreenCaptureKit's native audio capture.
        let _ = self.stream.update_configuration(&stream_configuration(
            width,
            height,
            settings.frame_rate,
            false,
        ));
    }

    pub async fn update_settings(&self, settings: CaptureSettings) -> Result<(), HelperError> {
        let (width, height) = fit_to_bounds(
            self.source_width,
            self.source_height,
            settings.width,
            settings.height,
        );
        self.stream
            .update_configuration(&stream_configuration(
                width,
                height,
                settings.frame_rate,
                self.audio_enabled.load(Ordering::Acquire),
            ))
            .map_err(|_| {
                HelperError::retryable(
                    "update-failed",
                    "macOS could not apply the new screen quality.",
                )
            })?;
        *self
            .settings
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = settings;
        Ok(())
    }
}

pub fn platform_name() -> PlatformName {
    PlatformName::Macos
}

pub fn capture_backend() -> &'static str {
    "screencapturekit-livekit"
}

pub fn capabilities() -> Capabilities {
    let video = macos_version_at_least(12, 3);
    let audio = macos_version_at_least(14, 2);
    Capabilities {
        video,
        system_audio: audio,
        application_audio: audio,
        process_tree_isolation: audio,
        min_os_version: Some("macOS 12.3 (audio: 14.2)".into()),
        reason: if !video {
            Some("Native capture requires macOS 12.3 or later.".into())
        } else if !audio {
            Some("Isolated audio requires macOS 14.2 or later; video still works.".into())
        } else {
            None
        },
    }
}

pub fn verify_host(host: &HostIdentity) -> Result<(), HelperError> {
    let parent = unsafe { libc::getppid() } as u32;
    if parent != host.electron_root_pid {
        return Err(HelperError::invalid(
            "untrusted-parent",
            "The native helper was not launched by the declared Electron process.",
        ));
    }
    Ok(())
}

pub async fn sources(
    host: &HostIdentity,
    _include_thumbnails: bool,
) -> Result<Vec<Source>, HelperError> {
    let content = shareable_content().await?;
    let windows = content.windows();
    let audio_supported = macos_version_at_least(14, 2);
    let host_proven = host_process_tree_is_proven(host, &content.applications());
    let mut result = content
        .displays()
        .into_iter()
        .enumerate()
        .map(|(index, display)| Source {
            id: format!("display:{}", display.display_id()),
            kind: SourceKind::Display,
            label: format!("Screen {}", index + 1),
            application_label: None,
            audio_available: audio_supported && host_proven,
            audio_unavailable_reason: (!(audio_supported && host_proven)).then(|| {
                "Bakbak could not prove its macOS process-tree exclusion; video remains available."
                    .into()
            }),
            thumbnail_data_url: None,
        })
        .collect::<Vec<_>>();
    let mut applications = content
        .applications()
        .into_iter()
        .filter(|application| is_shareable_application(application, &windows, host))
        .map(|application| Source {
            id: format!("application:{}", application.process_id()),
            kind: SourceKind::Application,
            label: application.application_name(),
            application_label: Some(application.bundle_identifier())
                .filter(|value| !value.trim().is_empty()),
            audio_available: audio_supported,
            audio_unavailable_reason: (!audio_supported)
                .then(|| "Application audio isolation requires macOS 14.2 or later.".into()),
            thumbnail_data_url: None,
        })
        .collect::<Vec<_>>();
    applications.sort_by_key(|source| source.label.to_lowercase());
    result.extend(applications);
    Ok(result)
}

pub async fn prepare(
    host: &HostIdentity,
    source_id: &str,
    include_audio: bool,
    settings: CaptureSettings,
    events: CaptureEventSender,
) -> Result<PreparedCapture, HelperError> {
    let content = shareable_content().await?;
    let displays = content.displays();
    let windows = content.windows();
    let applications = content.applications();
    let resolved = resolve_source(source_id, &displays, &windows, &applications, host)?;
    let audio_supported = macos_version_at_least(14, 2);
    let isolation_proven = match resolved.kind {
        SourceKind::Display => host_process_tree_is_proven(host, &applications),
        SourceKind::Application => true,
    };
    let audio_requested = include_audio && audio_supported && isolation_proven;
    let audio_unavailable_reason = (include_audio && !audio_requested).then(|| {
        "Safe process-tree audio isolation could not be established; video is still sharing.".into()
    });
    let (width, height) = fit_to_bounds(
        resolved.width,
        resolved.height,
        settings.width,
        settings.height,
    );
    Ok(PreparedCapture {
        metadata: PreparedMetadata {
            source_label: resolved.label,
            source_kind: resolved.kind,
            width,
            height,
            audio_requested,
            audio_isolation_mode: match (audio_requested, resolved.kind) {
                (true, SourceKind::Display) => AudioIsolationMode::ExcludeBakbakProcessTree,
                (true, SourceKind::Application) => AudioIsolationMode::IncludeSelectedProcessTree,
                (false, _) => AudioIsolationMode::Disabled,
            },
            audio_unavailable_reason,
        },
        settings,
        source_width: resolved.width,
        source_height: resolved.height,
        filter: resolved.filter,
        source_id: source_id.to_string(),
        host: host.clone(),
        events,
    })
}

struct ResolvedSource {
    label: String,
    kind: SourceKind,
    width: u32,
    height: u32,
    filter: SCContentFilter,
}

fn resolve_source(
    source_id: &str,
    displays: &[SCDisplay],
    windows: &[SCWindow],
    applications: &[SCRunningApplication],
    host: &HostIdentity,
) -> Result<ResolvedSource, HelperError> {
    if let Some(raw_id) = source_id.strip_prefix("display:") {
        let id = raw_id.parse::<u32>().map_err(|_| missing_source())?;
        let display = displays
            .iter()
            .find(|display| display.display_id() == id)
            .ok_or_else(missing_source)?;
        let excluded = applications
            .iter()
            .filter(|application| is_host_application(application, host))
            .collect::<Vec<_>>();
        let filter = if excluded.is_empty() {
            SCContentFilter::create()
                .with_display(display)
                .with_excluding_windows(&[])
                .build()
        } else {
            SCContentFilter::create()
                .with_display(display)
                .with_excluding_applications(&excluded, &[])
                .build()
        };
        let (width, height) = filter_pixel_size(&filter, (display.width(), display.height()));
        return Ok(ResolvedSource {
            label: format!("Screen {}", display_index(displays, id)),
            kind: SourceKind::Display,
            width,
            height,
            filter,
        });
    }
    if let Some(raw_pid) = source_id.strip_prefix("application:") {
        let pid = raw_pid.parse::<i32>().map_err(|_| missing_source())?;
        let application = applications
            .iter()
            .find(|application| application.process_id() == pid)
            .ok_or_else(missing_source)?;
        if !is_shareable_application(application, windows, host) {
            return Err(missing_source());
        }
        let display = application_display(application, displays, windows).ok_or_else(|| {
            HelperError::retryable(
                "source-display-missing",
                "macOS could not find a display for the selected application.",
            )
        })?;
        let included = applications
            .iter()
            .filter(|candidate| {
                process_is_in_tree(candidate.process_id(), application.process_id(), false)
            })
            .collect::<Vec<_>>();
        let filter = SCContentFilter::create()
            .with_display(display)
            .with_including_applications(&included, &[])
            .build();
        let (width, height) = filter_pixel_size(&filter, (display.width(), display.height()));
        return Ok(ResolvedSource {
            label: application.application_name(),
            kind: SourceKind::Application,
            width,
            height,
            filter,
        });
    }
    Err(missing_source())
}

pub async fn start_capture(
    prepared: PreparedCapture,
    video_source: NativeVideoSource,
    audio_source: Option<NativeAudioSource>,
) -> Result<(CaptureSession, bool, Option<String>), HelperError> {
    match start_capture_attempt(&prepared, video_source.clone(), audio_source, true).await {
        Ok(session) => Ok((session, prepared.includes_audio(), None)),
        Err(_) if prepared.includes_audio() => {
            start_capture_attempt(&prepared, video_source, None, false)
                .await
                .map(|session| {
                    (
                        session,
                        false,
                        Some(
                            "Isolated screen audio could not start; video is still sharing.".into(),
                        ),
                    )
                })
        }
        Err(error) => Err(error),
    }
}

async fn start_capture_attempt(
    prepared: &PreparedCapture,
    video_source: NativeVideoSource,
    audio_source: Option<NativeAudioSource>,
    capture_audio: bool,
) -> Result<CaptureSession, HelperError> {
    let isolated_audio = capture_audio && prepared.includes_audio() && audio_source.is_some();
    let configuration = stream_configuration(
        prepared.metadata.width,
        prepared.metadata.height,
        prepared.settings.frame_rate,
        isolated_audio,
    );
    if isolated_audio && !configuration.excludes_current_process_audio() {
        return Err(HelperError::invalid(
            "audio-isolation-unavailable",
            "macOS did not enable current-process audio exclusion.",
        ));
    }
    let audio_enabled = Arc::new(AtomicBool::new(isolated_audio));
    let (audio_sender, mut audio_receiver) = mpsc::channel::<OwnedAudioFrame>(8);
    let enabled_for_audio = audio_enabled.clone();
    let audio_task = audio_source.filter(|_| isolated_audio).map(|source| {
        tokio::spawn(async move {
            while let Some(frame) = audio_receiver.recv().await {
                if !enabled_for_audio.load(Ordering::Acquire) {
                    break;
                }
                let _ = source
                    .capture_frame(&AudioFrame {
                        data: Cow::Owned(frame.samples),
                        sample_rate: frame.sample_rate,
                        num_channels: frame.channels,
                        samples_per_channel: frame.samples_per_channel,
                    })
                    .await;
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
        prepared.events.clone(),
    );
    let handler = CaptureHandler {
        video_source,
        audio_sender: audio_task.as_ref().map(|_| audio_sender),
        audio_enabled: audio_enabled.clone(),
        first_frame_sender,
        first_frame_seen,
        paused,
        last_healthy_frame,
        events: prepared.events.clone(),
    };
    let delegate = CaptureDelegate {
        events: prepared.events.clone(),
    };
    let mut stream = SCStream::new_with_delegate(&prepared.filter, &configuration, delegate);
    if stream
        .add_output_handler(handler.clone(), SCStreamOutputType::Screen)
        .is_none()
    {
        pause_task.abort();
        abort_task(&audio_task);
        return Err(HelperError::retryable(
            "video-output-rejected",
            "macOS rejected the screen video output.",
        ));
    }
    if isolated_audio
        && stream
            .add_output_handler(handler, SCStreamOutputType::Audio)
            .is_none()
    {
        pause_task.abort();
        abort_task(&audio_task);
        return Err(HelperError::invalid(
            "audio-isolation-unavailable",
            "macOS rejected the isolated audio output.",
        ));
    }
    stream.start_capture().map_err(|_| {
        HelperError::retryable(
            "capture-start-failed",
            "macOS could not start native capture. Check Screen & System Audio Recording permission.",
        )
    })?;
    if let Err(error) = wait_for_first_frame(&mut first_frame_receiver).await {
        let _ = stream.stop_capture();
        pause_task.abort();
        abort_task(&audio_task);
        return Err(error);
    }
    let topology_task = isolated_audio.then(|| {
        start_topology_watchdog(
            stream.clone(),
            prepared.source_id.clone(),
            prepared.host.clone(),
            audio_enabled.clone(),
            prepared.events.clone(),
        )
    });
    Ok(CaptureSession {
        stream,
        audio_task,
        pause_task,
        topology_task,
        audio_enabled,
        settings: StdMutex::new(prepared.settings),
        source_width: prepared.source_width,
        source_height: prepared.source_height,
    })
}

fn start_topology_watchdog(
    stream: SCStream,
    source_id: String,
    host: HostIdentity,
    audio_enabled: Arc<AtomicBool>,
    events: CaptureEventSender,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        let mut previous = HashSet::new();
        loop {
            interval.tick().await;
            let Ok(content) = AsyncSCShareableContent::get().await else {
                isolation_lost(&audio_enabled, &events, "macos-topology-refresh-failed");
                break;
            };
            let current = content
                .applications()
                .iter()
                .map(|application| application.process_id())
                .collect::<HashSet<_>>();
            if current == previous {
                continue;
            }
            previous = current;
            let applications = content.applications();
            let resolved = resolve_source(
                &source_id,
                &content.displays(),
                &content.windows(),
                &applications,
                &host,
            );
            let safe = resolved.as_ref().is_ok_and(|source| {
                source.kind == SourceKind::Application
                    || host_process_tree_is_proven(&host, &applications)
            });
            if !safe
                || stream
                    .update_content_filter(&resolved.expect("checked").filter)
                    .is_err()
            {
                isolation_lost(&audio_enabled, &events, "macos-topology-proof-lost");
                break;
            }
        }
    })
}

fn isolation_lost(audio_enabled: &AtomicBool, events: &CaptureEventSender, code: &'static str) {
    audio_enabled.store(false, Ordering::Release);
    let _ = events.send(CaptureEvent::IsolationLost {
        code: code.into(),
        message: "macOS process topology changed; isolated audio stopped while video continues."
            .into(),
    });
}

#[derive(Clone)]
struct CaptureHandler {
    video_source: NativeVideoSource,
    audio_sender: Option<mpsc::Sender<OwnedAudioFrame>>,
    audio_enabled: Arc<AtomicBool>,
    first_frame_sender: mpsc::UnboundedSender<()>,
    first_frame_seen: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_healthy_frame: Arc<StdMutex<Instant>>,
    events: CaptureEventSender,
}

impl SCStreamOutputTrait for CaptureHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
        match output_type {
            SCStreamOutputType::Screen => {
                let status = sample.frame_status();
                if matches!(
                    status,
                    None | Some(SCFrameStatus::Complete) | Some(SCFrameStatus::Started)
                ) {
                    if let Ok(mut last) = self.last_healthy_frame.lock() {
                        *last = Instant::now();
                    }
                    if self.paused.swap(false, Ordering::AcqRel) {
                        let _ = self.events.send(CaptureEvent::Paused(false));
                    }
                }
                if matches!(
                    status,
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
            SCStreamOutputType::Audio if self.audio_enabled.load(Ordering::Acquire) => {
                if let Some(sender) = &self.audio_sender
                    && let Some(frame) = convert_audio_sample(&sample)
                {
                    let _ = sender.try_send(frame);
                }
            }
            _ => {}
        }
    }
}

struct CaptureDelegate {
    events: CaptureEventSender,
}

impl SCStreamDelegateTrait for CaptureDelegate {
    fn did_stop_with_error(&self, _error: screencapturekit::error::SCError) {
        let _ = self.events.send(CaptureEvent::Ended {
            code: "source-ended".into(),
            message: "The selected screen source stopped sharing.".into(),
        });
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
            output.extend(
                buffers
                    .buffer(0)?
                    .data()
                    .chunks_exact(4)
                    .take(expected)
                    .map(|chunk| {
                        float_to_i16(f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                    }),
            );
        } else {
            let channels_data = buffers
                .iter()
                .map(|buffer| buffer.data())
                .collect::<Vec<_>>();
            for index in 0..samples_per_channel as usize {
                for channel in 0..channels as usize {
                    let offset = index * 4;
                    let bytes = channels_data.get(channel)?.get(offset..offset + 4)?;
                    output.push(float_to_i16(f32::from_ne_bytes([
                        bytes[0], bytes[1], bytes[2], bytes[3],
                    ])));
                }
            }
        }
    } else if format.audio_bits_per_channel() == Some(16) {
        output.extend(
            buffers
                .buffer(0)?
                .data()
                .chunks_exact(2)
                .take(expected)
                .map(|chunk| i16::from_ne_bytes([chunk[0], chunk[1]])),
        );
    } else {
        return None;
    }
    (output.len() == expected).then_some(OwnedAudioFrame {
        samples: output,
        sample_rate,
        channels,
        samples_per_channel,
    })
}

fn stream_configuration(
    width: u32,
    height: u32,
    frame_rate: u32,
    audio: bool,
) -> SCStreamConfiguration {
    let configuration = SCStreamConfiguration::new()
        .with_width(width)
        .with_height(height)
        .with_pixel_format(PixelFormat::BGRA)
        .with_shows_cursor(true)
        .with_queue_depth(3)
        .with_minimum_frame_interval(&CMTime::new(1, frame_rate as i32));
    if audio && macos_version_at_least(14, 2) {
        configuration
            .with_captures_audio(true)
            .with_sample_rate(48_000)
            .with_channel_count(2)
            .with_excludes_current_process_audio(true)
    } else {
        configuration
    }
}

fn start_pause_watchdog(
    first_frame_seen: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_healthy_frame: Arc<StdMutex<Instant>>,
    events: CaptureEventSender,
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
            if elapsed >= PAUSED_SOURCE_TIMEOUT && !paused.swap(true, Ordering::AcqRel) {
                let _ = events.send(CaptureEvent::Paused(true));
            }
        }
    })
}

async fn wait_for_first_frame(
    receiver: &mut mpsc::UnboundedReceiver<()>,
) -> Result<(), HelperError> {
    match timeout(FIRST_FRAME_TIMEOUT, receiver.recv()).await {
        Ok(Some(())) => Ok(()),
        _ => Err(HelperError::retryable(
            "first-frame-timeout",
            "macOS did not deliver the first screen frame in time.",
        )),
    }
}

async fn shareable_content() -> Result<SCShareableContent, HelperError> {
    let access = ScreenCaptureAccess;
    if !access.preflight() && !access.request() {
        return Err(HelperError::invalid(
            "screen-permission-denied",
            "Enable Bakbak under Privacy & Security > Screen & System Audio Recording, then restart.",
        ));
    }
    timeout(SOURCE_ENUMERATION_TIMEOUT, AsyncSCShareableContent::get())
        .await
        .map_err(|_| {
            HelperError::retryable(
                "source-enumeration-timeout",
                "macOS took too long to list shareable sources.",
            )
        })?
        .map_err(|_| {
            HelperError::retryable(
                "source-enumeration-failed",
                "macOS refused to list shareable sources for this running app.",
            )
        })
}

fn is_shareable_application(
    application: &SCRunningApplication,
    windows: &[SCWindow],
    host: &HostIdentity,
) -> bool {
    !application.application_name().trim().is_empty()
        && !is_host_application(application, host)
        && !process_trees_overlap(application.process_id(), host.electron_root_pid as i32)
        && windows.iter().any(|window| {
            window.is_on_screen()
                && window
                    .owning_application()
                    .is_some_and(|owner| owner.process_id() == application.process_id())
        })
}

fn is_host_application(application: &SCRunningApplication, host: &HostIdentity) -> bool {
    // The Electron audio renderer can be a helper process with a different
    // bundle identifier. Exclude every shareable application whose process is
    // positively proven beneath the declared Electron root, not just the root
    // application's bundle identifier.
    process_is_in_tree(
        application.process_id(),
        host.electron_root_pid as i32,
        false,
    )
}

fn host_process_tree_is_proven(host: &HostIdentity, applications: &[SCRunningApplication]) -> bool {
    applications.iter().any(|application| {
        application.process_id() == host.electron_root_pid as i32
            && application.bundle_identifier() == host.bundle_id
    })
}

fn process_trees_overlap(left: i32, right: i32) -> bool {
    process_is_in_tree(left, right, true) || process_is_in_tree(right, left, true)
}

fn process_is_in_tree(process_id: i32, root: i32, unknown_is_overlap: bool) -> bool {
    if process_id <= 0 || root <= 0 {
        return true;
    }
    let mut current = process_id;
    let mut visited = HashSet::new();
    while visited.insert(current) {
        if current == root {
            return true;
        }
        if current == 1 {
            return false;
        }
        let Some(parent) = parent_process_id(current) else {
            return unknown_is_overlap;
        };
        if parent <= 0 || parent == current {
            return false;
        }
        current = parent;
    }
    true
}

fn parent_process_id(process_id: i32) -> Option<i32> {
    let mut info = unsafe { mem::zeroed::<libc::proc_bsdinfo>() };
    let size = mem::size_of::<libc::proc_bsdinfo>() as i32;
    let read = unsafe {
        libc::proc_pidinfo(
            process_id,
            libc::PROC_PIDTBSDINFO,
            0,
            (&mut info as *mut libc::proc_bsdinfo).cast(),
            size,
        )
    };
    (read == size).then_some(info.pbi_ppid as i32)
}

fn application_display<'a>(
    application: &SCRunningApplication,
    displays: &'a [SCDisplay],
    windows: &[SCWindow],
) -> Option<&'a SCDisplay> {
    windows
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
        .and_then(|window| display_for_window(window, displays))
        .or_else(|| displays.first())
}

fn display_for_window<'a>(window: &SCWindow, displays: &'a [SCDisplay]) -> Option<&'a SCDisplay> {
    let frame = window.frame();
    let x = frame.origin.x + frame.size.width / 2.0;
    let y = frame.origin.y + frame.size.height / 2.0;
    displays.iter().find(|display| {
        let frame = display.frame();
        x >= frame.origin.x
            && y >= frame.origin.y
            && x < frame.origin.x + frame.size.width
            && y < frame.origin.y + frame.size.height
    })
}

fn filter_pixel_size(filter: &SCContentFilter, fallback: (u32, u32)) -> (u32, u32) {
    // SCShareableContentInfo is a macOS 14 API. Bakbak still supports
    // video-only capture on 12.3 and 13.x, so never message this class there.
    if !macos_version_at_least(14, 0) {
        return fallback;
    }
    SCShareableContentInfo::for_filter(filter)
        .map(|info| info.pixel_size())
        .filter(|(width, height)| *width > 0 && *height > 0)
        .unwrap_or(fallback)
}

fn display_index(displays: &[SCDisplay], id: u32) -> usize {
    displays
        .iter()
        .position(|display| display.display_id() == id)
        .map(|index| index + 1)
        .unwrap_or(1)
}

fn window_area(window: &SCWindow) -> f64 {
    let frame = window.frame();
    frame.size.width.max(0.0) * frame.size.height.max(0.0)
}

fn fit_to_bounds(width: u32, height: u32, max_width: u32, max_height: u32) -> (u32, u32) {
    if width == 0 || height == 0 {
        return (max_width, max_height);
    }
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1.0);
    let even = |value: f64| ((value.round() as u32).max(2) / 2) * 2;
    (even(width as f64 * scale), even(height as f64 * scale))
}

fn float_to_i16(value: f32) -> i16 {
    (value.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
}

fn abort_task(task: &Option<JoinHandle<()>>) {
    if let Some(task) = task {
        task.abort();
    }
}

fn missing_source() -> HelperError {
    HelperError::retryable(
        "source-unavailable",
        "The selected screen source is no longer available.",
    )
}

fn macos_version_at_least(required_major: u64, required_minor: u64) -> bool {
    matches!(
        os_info::get().version(),
        os_info::Version::Semantic(major, minor, _)
            if *major > required_major
                || (*major == required_major && *minor >= required_minor)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scales_without_upscaling_and_keeps_even_dimensions() {
        assert_eq!(fit_to_bounds(3840, 2160, 1920, 1080), (1920, 1080));
        assert_eq!(fit_to_bounds(1280, 720, 1920, 1080), (1280, 720));
    }

    #[test]
    fn video_only_configuration_disables_native_audio_capture() {
        let configuration = stream_configuration(1280, 720, 30, false);
        assert!(!configuration.captures_audio());
    }
}
