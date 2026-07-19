mod platform;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use livekit::{
    Room, RoomEvent, RoomOptions,
    options::{AudioEncoding, TrackPublishOptions, VideoCodec, VideoEncoding},
    prelude::TrackSid,
    track::{LocalAudioTrack, LocalTrack, LocalVideoTrack, TrackSource},
    webrtc::{
        audio_source::native::NativeAudioSource,
        prelude::{AudioSourceOptions, RtcAudioSource, RtcVideoSource, VideoResolution},
        video_source::native::NativeVideoSource,
    },
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::{Emitter, Manager, State};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tokio::sync::{Mutex, mpsc};

#[cfg(any(target_os = "macos", target_os = "windows"))]
const SCREEN_SHARE_EVENT: &str = "screen-share-lifecycle";
#[cfg(any(target_os = "macos", target_os = "windows"))]
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);

const SCREEN_SHARE_RESOLUTIONS: [u32; 3] = [480, 720, 1080];
const SCREEN_SHARE_FRAME_RATES: [u32; 3] = [15, 30, 60];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenShareSettings {
    pub resolution: u32,
    pub frame_rate: u32,
}

impl Default for ScreenShareSettings {
    fn default() -> Self {
        Self {
            resolution: 1080,
            frame_rate: 60,
        }
    }
}

impl ScreenShareSettings {
    fn validate(self) -> Result<Self, String> {
        if !SCREEN_SHARE_RESOLUTIONS.contains(&self.resolution)
            || !SCREEN_SHARE_FRAME_RATES.contains(&self.frame_rate)
        {
            return Err("The requested screen-share quality is unsupported.".to_string());
        }
        Ok(self)
    }

    fn max_bitrate(self) -> u64 {
        match (self.resolution, self.frame_rate) {
            (480, 15) => 800_000,
            (480, 30) => 1_500_000,
            (480, 60) => 2_500_000,
            (720, 15) => 1_500_000,
            (720, 30) => 2_000_000,
            (720, 60) => 4_000_000,
            (1080, 15) => 2_500_000,
            (1080, 30) => 5_000_000,
            (1080, 60) => 8_000_000,
            _ => 8_000_000,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScreenShareSourceKind {
    Display,
    #[allow(dead_code)]
    Window,
    Application,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareCapabilities {
    available: bool,
    native_capture: bool,
    system_audio: bool,
    source_kinds: Vec<ScreenShareSourceKind>,
    resolutions: Vec<u32>,
    frame_rates: Vec<u32>,
    dynamic_settings: bool,
    custom_picker: bool,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareSource {
    id: String,
    kind: ScreenShareSourceKind,
    label: String,
    application_label: Option<String>,
    audio_available: bool,
    thumbnail_data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartScreenShareRequest {
    server_url: String,
    token: String,
    include_audio: bool,
    settings: ScreenShareSettings,
    #[serde(default)]
    source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareSessionResponse {
    session_id: String,
    source_label: String,
    source_kind: ScreenShareSourceKind,
    audio_published: bool,
    settings: ScreenShareSettings,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg(any(target_os = "macos", target_os = "windows"))]
struct ScreenShareLifecycleEvent {
    state: &'static str,
    session_id: Option<String>,
    source_label: Option<String>,
    source_kind: Option<ScreenShareSourceKind>,
    audio_published: bool,
    settings: Option<ScreenShareSettings>,
    message: Option<String>,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct ScreenShareManager {
    active: Mutex<Option<ActiveScreenShare>>,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Default for ScreenShareManager {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[derive(Default)]
pub struct ScreenShareManager;

#[cfg(any(target_os = "macos", target_os = "windows"))]
struct ActiveScreenShare {
    session_id: String,
    room: Room,
    capture: platform::CaptureSession,
    video_track: LocalVideoTrack,
    video_track_sid: TrackSid,
    source_label: String,
    source_kind: ScreenShareSourceKind,
    audio_published: bool,
    settings: ScreenShareSettings,
}

#[tauri::command]
pub fn get_screen_share_capabilities(
    window: WebviewWindow,
) -> Result<ScreenShareCapabilities, String> {
    ensure_main_window(&window)?;
    Ok(platform::capabilities())
}

#[tauri::command]
pub fn open_screen_recording_settings(window: WebviewWindow) -> Result<(), String> {
    ensure_main_window(&window)?;
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_opener::OpenerExt;
        window
            .app_handle()
            .opener()
            .open_url(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
                None::<&str>,
            )
            .map_err(|error| format!("Could not open Screen Recording settings: {error}"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Screen Recording settings are available only on macOS.".to_string())
    }
}

#[tauri::command]
pub async fn list_screen_share_sources(
    window: WebviewWindow,
) -> Result<Vec<ScreenShareSource>, String> {
    ensure_main_window(&window)?;
    #[cfg(target_os = "macos")]
    {
        platform::sources().await
    }
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(platform::sources)
            .await
            .map_err(|error| format!("Windows source enumeration stopped unexpectedly: {error}"))?
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub async fn start_screen_share(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    request: StartScreenShareRequest,
) -> Result<ScreenShareSessionResponse, String> {
    ensure_main_window(&window)?;
    validate_request(&request)?;
    let settings = request.settings.validate()?;
    let mut active = manager.active.lock().await;
    if active.is_some() {
        return Err("A screen share is already active in this Bakbak window.".to_string());
    }

    emit(
        &app,
        "selecting",
        None,
        None,
        None,
        false,
        Some(settings),
        None,
    );
    let (termination_sender, mut termination_receiver) = mpsc::unbounded_channel();
    let (pause_sender, mut pause_receiver) = mpsc::unbounded_channel();
    let prepared = match platform::pick_source(
        request.include_audio,
        settings,
        request.source_id.as_deref(),
        termination_sender.clone(),
        pause_sender,
    )
    .await
    {
        Ok(prepared) => prepared,
        Err(error) => {
            emit(&app, "idle", None, None, None, false, None, None);
            return Err(error);
        }
    };
    emit(
        &app,
        "starting",
        None,
        Some(prepared.source_label.clone()),
        Some(prepared.source_kind),
        false,
        Some(settings),
        None,
    );

    let session_id = format!("screen-{}", SESSION_COUNTER.fetch_add(1, Ordering::Relaxed));
    let result = start_publisher(&request, prepared, termination_sender).await;
    let (room, capture, video_track, video_track_sid, source_label, source_kind, audio_published) =
        match result {
            Ok(value) => value,
            Err(error) => {
                emit(
                    &app,
                    "error",
                    Some(session_id),
                    None,
                    None,
                    false,
                    Some(settings),
                    Some(error.clone()),
                );
                return Err(error);
            }
        };

    *active = Some(ActiveScreenShare {
        session_id: session_id.clone(),
        room,
        capture,
        video_track,
        video_track_sid,
        source_label: source_label.clone(),
        source_kind,
        audio_published,
        settings,
    });
    let app_for_termination = app.clone();
    let session_for_termination = session_id.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(message) = termination_receiver.recv().await {
            terminate_active_share(app_for_termination, session_for_termination, message).await;
        }
    });
    let app_for_pause = app.clone();
    let session_for_pause = session_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(paused) = pause_receiver.recv().await {
            set_active_share_paused(app_for_pause.clone(), session_for_pause.clone(), paused).await;
        }
    });
    emit(
        &app,
        "sharing",
        Some(session_id.clone()),
        Some(source_label.clone()),
        Some(source_kind),
        audio_published,
        Some(settings),
        None,
    );
    Ok(ScreenShareSessionResponse {
        session_id,
        source_label,
        source_kind,
        audio_published,
        settings,
    })
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub async fn start_screen_share(
    window: WebviewWindow,
    request: StartScreenShareRequest,
) -> Result<ScreenShareSessionResponse, String> {
    ensure_main_window(&window)?;
    validate_request(&request)?;
    Err("Native screen capture is unavailable on this build.".to_string())
}

#[tauri::command]
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub async fn stop_screen_share(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    session_id: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    let mut active = manager.active.lock().await;
    let Some(current) = active.take() else {
        emit(&app, "idle", None, None, None, false, None, None);
        return Ok(());
    };
    if current.session_id != session_id {
        *active = Some(current);
        return Err("That screen-share session is no longer active.".to_string());
    }

    emit(
        &app,
        "stopping",
        Some(session_id),
        Some(current.source_label.clone()),
        Some(current.source_kind),
        current.audio_published,
        Some(current.settings),
        None,
    );
    current.capture.stop().await;
    current
        .room
        .close()
        .await
        .map_err(|error| error.to_string())?;
    emit(&app, "idle", None, None, None, false, None, None);
    Ok(())
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub async fn stop_screen_share(window: WebviewWindow, _session_id: String) -> Result<(), String> {
    ensure_main_window(&window)
}

#[tauri::command]
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub async fn update_screen_share_settings(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    session_id: String,
    settings: ScreenShareSettings,
) -> Result<ScreenShareSettings, String> {
    ensure_main_window(&window)?;
    let settings = settings.validate()?;
    let mut active = manager.active.lock().await;
    let current = active
        .as_mut()
        .filter(|share| share.session_id == session_id)
        .ok_or_else(|| "That screen-share session is no longer active.".to_string())?;
    if current.settings == settings {
        return Ok(settings);
    }

    let previous = current.settings;
    current.capture.update_settings(settings).await?;
    let local = current.room.local_participant();
    let _ = local.unpublish_track(&current.video_track_sid).await;
    match publish_video(&current.room, current.video_track.clone(), settings).await {
        Ok(track_sid) => {
            current.video_track_sid = track_sid;
            current.settings = settings;
            emit(
                &app,
                "sharing",
                Some(current.session_id.clone()),
                Some(current.source_label.clone()),
                Some(current.source_kind),
                current.audio_published,
                Some(settings),
                None,
            );
            Ok(settings)
        }
        Err(error) => {
            let _ = current.capture.update_settings(previous).await;
            if let Ok(track_sid) =
                publish_video(&current.room, current.video_track.clone(), previous).await
            {
                current.video_track_sid = track_sid;
            }
            Err(error)
        }
    }
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub async fn update_screen_share_settings(
    window: WebviewWindow,
    _session_id: String,
    settings: ScreenShareSettings,
) -> Result<ScreenShareSettings, String> {
    ensure_main_window(&window)?;
    settings.validate()?;
    Err("Live screen-share changes are unavailable on this build.".to_string())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn start_publisher(
    request: &StartScreenShareRequest,
    prepared: platform::PreparedCapture,
    termination_sender: mpsc::UnboundedSender<String>,
) -> Result<
    (
        Room,
        platform::CaptureSession,
        LocalVideoTrack,
        TrackSid,
        String,
        ScreenShareSourceKind,
        bool,
    ),
    String,
> {
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
    let video_track_sid =
        publish_video(&room, video_track.clone(), request.settings.validate()?).await?;

    let requested_audio_source = prepared
        .include_audio
        .then(|| NativeAudioSource::new(AudioSourceOptions::default(), 48_000, 2, 200));
    let source_label = prepared.source_label.clone();
    let source_kind = prepared.source_kind;
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
    Ok((
        room,
        capture,
        video_track,
        video_track_sid,
        source_label,
        source_kind,
        audio_published,
    ))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn publish_video(
    room: &Room,
    video_track: LocalVideoTrack,
    settings: ScreenShareSettings,
) -> Result<TrackSid, String> {
    let publication = room
        .local_participant()
        .publish_track(
            LocalTrack::Video(video_track),
            TrackPublishOptions {
                source: TrackSource::Screenshare,
                video_codec: VideoCodec::H264,
                video_encoding: Some(VideoEncoding {
                    max_bitrate: settings.max_bitrate(),
                    max_framerate: settings.frame_rate as f64,
                }),
                simulcast: true,
                ..Default::default()
            },
        )
        .await
        .map_err(|error| format!("Bakbak could not publish the selected screen: {error}"))?;
    Ok(publication.sid())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub async fn stop_active_share_for_shutdown(app: AppHandle) {
    let manager = app.state::<ScreenShareManager>();
    let current = manager.active.lock().await.take();
    if let Some(current) = current {
        current.capture.stop().await;
        let _ = current.room.close().await;
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub async fn stop_active_share_for_shutdown(_app: AppHandle) {}

#[cfg(any(target_os = "macos", target_os = "windows"))]
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
        emit(
            &app,
            "error",
            Some(session_id),
            Some(current.source_label),
            Some(current.source_kind),
            current.audio_published,
            Some(current.settings),
            Some(message),
        );
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn set_active_share_paused(app: AppHandle, session_id: String, paused: bool) {
    let manager = app.state::<ScreenShareManager>();
    let active = manager.active.lock().await;
    let Some(current) = active
        .as_ref()
        .filter(|share| share.session_id == session_id)
    else {
        return;
    };
    if paused {
        current.video_track.mute();
    } else {
        current.video_track.unmute();
    }
    emit(
        &app,
        if paused { "paused" } else { "sharing" },
        Some(current.session_id.clone()),
        Some(current.source_label.clone()),
        Some(current.source_kind),
        current.audio_published,
        Some(current.settings),
        None,
    );
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

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn emit(
    app: &AppHandle,
    state: &'static str,
    session_id: Option<String>,
    source_label: Option<String>,
    source_kind: Option<ScreenShareSourceKind>,
    audio_published: bool,
    settings: Option<ScreenShareSettings>,
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
            source_kind,
            audio_published,
            settings,
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
                settings: ScreenShareSettings::default(),
                source_id: None,
            })
            .is_err()
        );
        assert!(
            validate_request(&StartScreenShareRequest {
                server_url: "wss://example.test".into(),
                token: "".into(),
                include_audio: false,
                settings: ScreenShareSettings::default(),
                source_id: None,
            })
            .is_err()
        );
    }

    #[test]
    fn validates_all_nine_quality_combinations_and_bitrates() {
        let expected = [
            ((480, 15), 800_000),
            ((480, 30), 1_500_000),
            ((480, 60), 2_500_000),
            ((720, 15), 1_500_000),
            ((720, 30), 2_000_000),
            ((720, 60), 4_000_000),
            ((1080, 15), 2_500_000),
            ((1080, 30), 5_000_000),
            ((1080, 60), 8_000_000),
        ];
        for ((resolution, frame_rate), bitrate) in expected {
            let settings = ScreenShareSettings {
                resolution,
                frame_rate,
            };
            assert_eq!(settings.validate(), Ok(settings));
            assert_eq!(settings.max_bitrate(), bitrate);
        }
        assert!(
            ScreenShareSettings {
                resolution: 1440,
                frame_rate: 60
            }
            .validate()
            .is_err()
        );
    }
}
