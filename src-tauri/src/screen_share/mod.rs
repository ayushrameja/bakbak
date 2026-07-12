mod platform;

#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "macos")]
use livekit::{
    Room, RoomEvent, RoomOptions,
    options::{AudioEncoding, TrackPublishOptions, VideoCodec, VideoEncoding},
    track::{LocalAudioTrack, LocalTrack, LocalVideoTrack, TrackSource},
    webrtc::{
        audio_source::native::NativeAudioSource,
        prelude::{AudioSourceOptions, RtcAudioSource, RtcVideoSource, VideoResolution},
        video_source::native::NativeVideoSource,
    },
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};
#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager, State};
#[cfg(target_os = "macos")]
use tokio::sync::{Mutex, mpsc};

#[cfg(target_os = "macos")]
const SCREEN_SHARE_EVENT: &str = "screen-share-lifecycle";
#[cfg(target_os = "macos")]
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareCapabilities {
    available: bool,
    native_capture: bool,
    system_audio: bool,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartScreenShareRequest {
    server_url: String,
    token: String,
    include_audio: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareSessionResponse {
    session_id: String,
    source_label: String,
    audio_published: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg(target_os = "macos")]
struct ScreenShareLifecycleEvent {
    state: &'static str,
    session_id: Option<String>,
    source_label: Option<String>,
    audio_published: bool,
    message: Option<String>,
}

#[cfg(target_os = "macos")]
pub struct ScreenShareManager {
    active: Mutex<Option<ActiveScreenShare>>,
}

#[cfg(target_os = "macos")]
impl Default for ScreenShareManager {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}

#[cfg(not(target_os = "macos"))]
#[derive(Default)]
pub struct ScreenShareManager;

#[cfg(target_os = "macos")]
struct ActiveScreenShare {
    session_id: String,
    room: Room,
    capture: platform::CaptureSession,
}

#[tauri::command]
pub fn get_screen_share_capabilities(
    window: WebviewWindow,
) -> Result<ScreenShareCapabilities, String> {
    ensure_main_window(&window)?;
    Ok(platform::capabilities())
}

#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn start_screen_share(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    request: StartScreenShareRequest,
) -> Result<ScreenShareSessionResponse, String> {
    ensure_main_window(&window)?;
    validate_request(&request)?;
    let mut active = manager.active.lock().await;
    if active.is_some() {
        return Err("A screen share is already active in this Bakbak window.".to_string());
    }

    emit(&app, "selecting", None, None, false, None);
    let (termination_sender, mut termination_receiver) = mpsc::unbounded_channel();
    let prepared =
        match platform::pick_source(request.include_audio, termination_sender.clone()).await {
            Ok(prepared) => prepared,
            Err(error) => {
                emit(&app, "idle", None, None, false, None);
                return Err(error);
            }
        };
    emit(
        &app,
        "starting",
        None,
        Some(prepared.source_label.clone()),
        false,
        None,
    );

    let session_id = format!("screen-{}", SESSION_COUNTER.fetch_add(1, Ordering::Relaxed));
    let result = start_publisher(&request, prepared, termination_sender).await;
    let (room, capture, source_label, audio_published) = match result {
        Ok(value) => value,
        Err(error) => {
            emit(
                &app,
                "error",
                Some(session_id),
                None,
                false,
                Some(error.clone()),
            );
            return Err(error);
        }
    };

    *active = Some(ActiveScreenShare {
        session_id: session_id.clone(),
        room,
        capture,
    });
    let app_for_termination = app.clone();
    let session_for_termination = session_id.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(message) = termination_receiver.recv().await {
            terminate_active_share(app_for_termination, session_for_termination, message).await;
        }
    });
    emit(
        &app,
        "sharing",
        Some(session_id.clone()),
        Some(source_label.clone()),
        audio_published,
        None,
    );
    Ok(ScreenShareSessionResponse {
        session_id,
        source_label,
        audio_published,
    })
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn start_screen_share(
    window: WebviewWindow,
    request: StartScreenShareRequest,
) -> Result<ScreenShareSessionResponse, String> {
    ensure_main_window(&window)?;
    validate_request(&request)?;
    Err("Native screen capture is unavailable on this build.".to_string())
}

#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn stop_screen_share(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    session_id: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    let mut active = manager.active.lock().await;
    let Some(current) = active.take() else {
        emit(&app, "idle", None, None, false, None);
        return Ok(());
    };
    if current.session_id != session_id {
        *active = Some(current);
        return Err("That screen-share session is no longer active.".to_string());
    }

    emit(&app, "stopping", Some(session_id), None, false, None);
    current.capture.stop().await;
    current
        .room
        .close()
        .await
        .map_err(|error| error.to_string())?;
    emit(&app, "idle", None, None, false, None);
    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn stop_screen_share(window: WebviewWindow, _session_id: String) -> Result<(), String> {
    ensure_main_window(&window)
}

#[cfg(target_os = "macos")]
async fn start_publisher(
    request: &StartScreenShareRequest,
    prepared: platform::PreparedCapture,
    termination_sender: mpsc::UnboundedSender<String>,
) -> Result<(Room, platform::CaptureSession, String, bool), String> {
    let (room, mut events) =
        Room::connect(&request.server_url, &request.token, RoomOptions::default())
            .await
            .map_err(|error| format!("Bakbak could not connect the screen publisher: {error}"))?;
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if matches!(event, RoomEvent::Disconnected { .. }) {
                let _ = termination_sender
                    .send("The screen-share connection ended unexpectedly.".to_string());
                break;
            }
        }
    });

    let resolution = VideoResolution {
        width: prepared.width,
        height: prepared.height,
    };
    let video_source = NativeVideoSource::new(resolution, true);
    let video_track = LocalVideoTrack::create_video_track(
        "bakbak-screen",
        RtcVideoSource::Native(video_source.clone()),
    );
    room.local_participant()
        .publish_track(
            LocalTrack::Video(video_track),
            TrackPublishOptions {
                source: TrackSource::Screenshare,
                video_codec: VideoCodec::H264,
                video_encoding: Some(VideoEncoding {
                    max_bitrate: 2_500_000,
                    max_framerate: 15.0,
                }),
                simulcast: true,
                ..Default::default()
            },
        )
        .await
        .map_err(|error| format!("Bakbak could not publish the selected screen: {error}"))?;

    let requested_audio_source = prepared
        .include_audio
        .then(|| NativeAudioSource::new(AudioSourceOptions::default(), 48_000, 2, 200));
    let source_label = prepared.source_label.clone();
    let (capture, audio_captured) =
        match platform::start_capture(prepared, video_source, requested_audio_source.clone()).await
        {
            Ok(value) => value,
            Err(error) => {
                let _ = room.close().await;
                return Err(error);
            }
        };

    let mut audio_published = false;
    if audio_captured && let Some(source) = requested_audio_source {
        let track = LocalAudioTrack::create_audio_track(
            "bakbak-screen-audio",
            RtcAudioSource::Native(source.clone()),
        );
        if room
            .local_participant()
            .publish_track(
                LocalTrack::Audio(track),
                TrackPublishOptions {
                    source: TrackSource::ScreenshareAudio,
                    audio_encoding: Some(AudioEncoding {
                        max_bitrate: 128_000,
                    }),
                    dtx: false,
                    ..Default::default()
                },
            )
            .await
            .is_ok()
        {
            audio_published = true;
        }
    }
    Ok((room, capture, source_label, audio_published))
}

#[cfg(target_os = "macos")]
pub async fn stop_active_share_for_shutdown(app: AppHandle) {
    let manager = app.state::<ScreenShareManager>();
    let current = manager.active.lock().await.take();
    if let Some(current) = current {
        current.capture.stop().await;
        let _ = current.room.close().await;
    }
}

#[cfg(not(target_os = "macos"))]
pub async fn stop_active_share_for_shutdown(_app: AppHandle) {}

#[cfg(target_os = "macos")]
async fn terminate_active_share(app: AppHandle, session_id: String, message: String) {
    let manager = app.state::<ScreenShareManager>();
    let current = {
        let mut active = manager.active.lock().await;
        if active.as_ref().map(|share| share.session_id.as_str()) != Some(session_id.as_str()) {
            return;
        }
        active.take()
    };
    if let Some(current) = current {
        current.capture.stop().await;
        let _ = current.room.close().await;
        emit(&app, "error", Some(session_id), None, false, Some(message));
    }
}

fn ensure_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Screen sharing is restricted to Bakbak's main window.".to_string())
    }
}

fn validate_request(request: &StartScreenShareRequest) -> Result<(), String> {
    if !matches!(
        request.server_url.strip_prefix("wss://"),
        Some(value) if !value.is_empty()
    ) && !matches!(
        request.server_url.strip_prefix("ws://"),
        Some(value) if !value.is_empty()
    ) {
        return Err("The screen publisher received an invalid LiveKit URL.".to_string());
    }
    if request.token.trim().is_empty() || request.token.len() > 16_384 {
        return Err("The screen publisher received an invalid token.".to_string());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn emit(
    app: &AppHandle,
    state: &'static str,
    session_id: Option<String>,
    source_label: Option<String>,
    audio_published: bool,
    message: Option<String>,
) {
    eprintln!("Bakbak screen share state: {state}");
    if let Some(message) = message.as_deref() {
        eprintln!("Bakbak screen share error: {message}");
    }
    let _ = app.emit(
        SCREEN_SHARE_EVENT,
        ScreenShareLifecycleEvent {
            state,
            session_id,
            source_label,
            audio_published,
            message,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn initializes_the_native_webrtc_video_factory() {
        let _source = NativeVideoSource::new(
            VideoResolution {
                width: 16,
                height: 16,
            },
            true,
        );
    }

    #[test]
    fn rejects_non_websocket_urls_and_empty_tokens() {
        assert!(
            validate_request(&StartScreenShareRequest {
                server_url: "https://example.test".into(),
                token: "token".into(),
                include_audio: false,
            })
            .is_err()
        );
        assert!(
            validate_request(&StartScreenShareRequest {
                server_url: "wss://example.test".into(),
                token: "".into(),
                include_audio: false,
            })
            .is_err()
        );
    }
}
