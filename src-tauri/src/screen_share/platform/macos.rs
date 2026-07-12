use std::{
    borrow::Cow,
    mem,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use livekit::webrtc::{
    audio_source::native::NativeAudioSource,
    prelude::{AudioFrame, VideoFrame, VideoRotation},
    video_frame::native::NativeBuffer,
    video_source::native::NativeVideoSource,
};
use screencapturekit::{
    async_api::AsyncSCContentSharingPicker,
    content_sharing_picker::{
        SCContentSharingPickerConfiguration, SCPickedSource, SCPickerOutcome,
    },
    prelude::*,
    stream::delegate_trait::SCStreamDelegateTrait,
};
use tokio::{sync::mpsc, task::JoinHandle, time::timeout};

use super::super::ScreenShareCapabilities;

const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(5);

pub struct PreparedCapture {
    pub source_label: String,
    pub width: u32,
    pub height: u32,
    pub include_audio: bool,
    filter: SCContentFilter,
    termination_sender: mpsc::UnboundedSender<String>,
}

pub struct CaptureSession {
    stream: SCStream,
    audio_task: Option<JoinHandle<()>>,
}

impl CaptureSession {
    pub async fn stop(mut self) {
        let _ = self.stream.stop_capture();
        if let Some(task) = self.audio_task.take() {
            task.abort();
        }
    }
}

pub fn capabilities() -> ScreenShareCapabilities {
    let supports_picker =
        matches!(os_info::get().version(), os_info::Version::Semantic(major, _, _) if *major >= 14);
    ScreenShareCapabilities {
        available: true,
        native_capture: supports_picker,
        system_audio: supports_picker,
        reason: (!supports_picker).then(|| {
            "Matched system audio requires macOS 14 or later; Bakbak will use video-only sharing."
                .to_string()
        }),
    }
}

pub async fn pick_source(
    include_audio: bool,
    termination_sender: mpsc::UnboundedSender<String>,
) -> Result<PreparedCapture, String> {
    let configuration = SCContentSharingPickerConfiguration::new();
    let picked = match AsyncSCContentSharingPicker::show(&configuration).await {
        SCPickerOutcome::Picked(result) => result,
        SCPickerOutcome::Cancelled => {
            return Err("Screen sharing was cancelled.".to_string());
        }
        SCPickerOutcome::Error(error) => {
            return Err(format!("The macOS screen picker failed: {error}"));
        }
    };
    let (source_width, source_height) = picked.pixel_size();
    let (width, height) = fit_1080p(source_width, source_height);
    let source_label = match picked.source() {
        SCPickedSource::Window(title) => title,
        SCPickedSource::Application(name) => name,
        SCPickedSource::Display(id) => format!("Display {id}"),
        SCPickedSource::Unknown => "Shared screen".to_string(),
    };

    Ok(PreparedCapture {
        source_label,
        width,
        height,
        include_audio,
        filter: picked.filter(),
        termination_sender,
    })
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
    let frame_interval = CMTime::new(1, 15);
    let configuration = SCStreamConfiguration::new()
        .with_width(prepared.width)
        .with_height(prepared.height)
        .with_pixel_format(PixelFormat::BGRA)
        .with_shows_cursor(true)
        .with_queue_depth(3)
        .with_minimum_frame_interval(&frame_interval)
        .with_captures_audio(capture_audio && audio_source.is_some())
        .with_sample_rate(48_000)
        .with_channel_count(2)
        .with_excludes_current_process_audio(true);

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

    let handler = CaptureHandler {
        video_source,
        audio_sender: audio_task.as_ref().map(|_| audio_sender),
        first_frame_sender,
        first_frame_seen: Arc::new(AtomicBool::new(false)),
    };
    let delegate = CaptureDelegate {
        termination_sender: prepared.termination_sender.clone(),
    };
    let mut stream = SCStream::new_with_delegate(&prepared.filter, &configuration, delegate);
    if stream
        .add_output_handler(handler.clone(), SCStreamOutputType::Screen)
        .is_none()
    {
        abort_audio_task(&audio_task);
        return Err("macOS rejected Bakbak's screen video output.".to_string());
    }
    if audio_task.is_some()
        && stream
            .add_output_handler(handler, SCStreamOutputType::Audio)
            .is_none()
    {
        abort_audio_task(&audio_task);
        return Err("macOS rejected the selected source's audio output.".to_string());
    }
    if let Err(error) = stream.start_capture() {
        abort_audio_task(&audio_task);
        return Err(format!(
            "macOS could not start capture. Allow Bakbak under Privacy & Security > Screen & System Audio Recording, then relaunch it: {error}"
        ));
    }
    if let Err(error) = wait_for_first_frame(&mut first_frame_receiver, FIRST_FRAME_TIMEOUT).await {
        let _ = stream.stop_capture();
        abort_audio_task(&audio_task);
        return Err(error);
    }

    Ok(CaptureSession { stream, audio_task })
}

fn abort_audio_task(audio_task: &Option<JoinHandle<()>>) {
    if let Some(task) = audio_task {
        task.abort();
    }
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
}

impl SCStreamOutputTrait for CaptureHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
        match output_type {
            SCStreamOutputType::Screen => {
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

fn fit_1080p(width: u32, height: u32) -> (u32, u32) {
    if width == 0 || height == 0 {
        return (1920, 1080);
    }
    let scale = (1920.0 / width as f64).min(1080.0 / height as f64).min(1.0);
    let even = |value: f64| ((value.round() as u32).max(2) / 2) * 2;
    (even(width as f64 * scale), even(height as f64 * scale))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_capture_dimensions_without_changing_aspect_ratio() {
        assert_eq!(fit_1080p(3840, 2160), (1920, 1080));
        assert_eq!(fit_1080p(1280, 720), (1280, 720));
        assert_eq!(fit_1080p(2560, 1440), (1920, 1080));
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
