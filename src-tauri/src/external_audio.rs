use std::{
    fmt,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use bakbak_external_audio::{
    DeviceSnapshot, ExternalAudioEngine, Levels, MAX_SOUND_SAMPLES, MIX_SAMPLE_RATE, SessionConfig,
    SessionState, SessionStatus, SetupRecording, SetupTestConfig,
};
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, SeqAccess, Visitor},
};
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
};

const STATE_EVENT: &str = "external-audio:state";
const LEVELS_EVENT: &str = "external-audio:levels";
const FAILURE_EVENT: &str = "external-audio:failure";
pub const CLOSE_EXPLANATION_EVENT: &str = "external-audio:close-explanation";
const MAIN_WINDOW: &str = "main";
const OVERLAY_WINDOW: &str = "external-soundboard";
const MAX_FAILURE_CODE_CHARS: usize = 64;
const MAX_FAILURE_MESSAGE_CHARS: usize = 500;
const MAX_SOUND_ID_BYTES: usize = 128;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ExternalAudioFailure {
    code: String,
    message: String,
}

#[derive(Clone)]
pub struct ExternalAudioManager {
    engine: Arc<ExternalAudioEngine>,
    close_explanation_shown: Arc<AtomicBool>,
}

impl Default for ExternalAudioManager {
    fn default() -> Self {
        Self {
            engine: Arc::new(ExternalAudioEngine::new()),
            close_explanation_shown: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl ExternalAudioManager {
    pub fn state(&self) -> SessionState {
        self.engine.state()
    }

    pub fn is_live(&self) -> bool {
        self.state().status == SessionStatus::Live
    }

    pub fn stop(&self) -> SessionState {
        self.engine.stop()
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    pub fn suspend(&self) -> SessionState {
        self.engine.suspend()
    }

    pub fn release_after_failure(&self) -> SessionState {
        self.engine.release_after_failure()
    }

    pub fn should_explain_close(&self) -> bool {
        !self.close_explanation_shown.swap(true, Ordering::AcqRel)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExternalAudioUpdate {
    microphone_muted: Option<bool>,
    microphone_gain: Option<f32>,
    soundboard_gain: Option<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExternalAudioPlay {
    #[serde(deserialize_with = "deserialize_sound_id")]
    sound_id: String,
    sample_rate: u32,
    #[serde(deserialize_with = "deserialize_sound_samples")]
    samples: Vec<f32>,
}

fn deserialize_sound_id<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_string(SoundIdVisitor)
}

struct SoundIdVisitor;

impl<'de> Visitor<'de> for SoundIdVisitor {
    type Value = String;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded sound identifier")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        validate_sound_id(value).map_err(E::custom)?;
        Ok(value.to_owned())
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        validate_sound_id(&value).map_err(E::custom)?;
        Ok(value)
    }
}

fn validate_sound_id(value: &str) -> Result<(), &'static str> {
    if value.is_empty() || value.len() > MAX_SOUND_ID_BYTES || value.chars().any(char::is_control) {
        Err("sound identifiers must be 1-128 control-free bytes")
    } else {
        Ok(())
    }
}

fn deserialize_sound_samples<'de, D>(deserializer: D) -> Result<Vec<f32>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_seq(SoundSamplesVisitor)
}

struct SoundSamplesVisitor;

impl<'de> Visitor<'de> for SoundSamplesVisitor {
    type Value = Vec<f32>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "at most {MAX_SOUND_SAMPLES} mono PCM samples")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        if let Some(length) = sequence.size_hint()
            && length > MAX_SOUND_SAMPLES
        {
            return Err(de::Error::invalid_length(length, &self));
        }
        let mut samples =
            Vec::with_capacity(sequence.size_hint().unwrap_or(0).min(MAX_SOUND_SAMPLES));
        while let Some(sample) = sequence.next_element::<f32>()? {
            if samples.len() >= MAX_SOUND_SAMPLES {
                return Err(de::Error::invalid_length(
                    MAX_SOUND_SAMPLES.saturating_add(1),
                    &self,
                ));
            }
            samples.push(sample);
        }
        Ok(samples)
    }
}

#[tauri::command]
pub fn external_audio_list_devices(
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<DeviceSnapshot, String> {
    ensure_main_window(&window)?;
    manager.engine.list_devices()
}

#[tauri::command]
pub fn external_audio_get_state(
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<SessionState, String> {
    ensure_audio_window(&window)?;
    Ok(manager.state())
}

#[tauri::command]
pub fn external_audio_start_setup_test(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
    config: SetupTestConfig,
) -> Result<SessionState, String> {
    ensure_main_window(&window)?;
    let state = manager.engine.start_setup_test(config)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_clear_setup_recording(
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    manager.engine.clear_setup_recording()
}

#[tauri::command]
pub fn external_audio_capture_setup_recording(
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<SetupRecording, String> {
    ensure_main_window(&window)?;
    manager.engine.capture_setup_recording()
}

#[tauri::command]
pub fn external_audio_play_setup_tone(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<SessionState, String> {
    ensure_main_window(&window)?;
    let state = manager.engine.play_setup_tone()?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_play_setup_recording(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
    recording: SetupRecording,
) -> Result<SessionState, String> {
    ensure_main_window(&window)?;
    let state = manager.engine.play_setup_recording(recording)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_stop_setup_test(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<SessionState, String> {
    ensure_main_window(&window)?;
    let state = manager.engine.stop_setup_test()?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_start(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
    config: SessionConfig,
) -> Result<SessionState, String> {
    ensure_main_window(&window)?;
    let state = manager.engine.start(config)?;
    if let Err(error) = crate::soundboard_overlay::browse(&app) {
        let stopped = manager.stop();
        destroy_overlay(&app);
        emit_state(&app, &stopped);
        return Err(format!("{error} External audio was stopped safely."));
    }
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_update(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
    input: ExternalAudioUpdate,
) -> Result<SessionState, String> {
    ensure_audio_window(&window)?;
    let state = manager.engine.update(
        input.microphone_muted,
        input.microphone_gain,
        input.soundboard_gain,
    )?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_play(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
    input: ExternalAudioPlay,
) -> Result<SessionState, String> {
    ensure_audio_window(&window)?;
    if input.sample_rate != MIX_SAMPLE_RATE {
        return Err("External sounds must use 48 kHz PCM.".into());
    }
    let state = manager.engine.play_sound(input.sound_id, input.samples)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_stop_sound(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<SessionState, String> {
    ensure_audio_window(&window)?;
    let state = manager.engine.stop_sound();
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_stop(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<SessionState, String> {
    ensure_audio_window(&window)?;
    let state = manager.stop();
    destroy_overlay(&app);
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn external_audio_show_overlay(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<(), String> {
    ensure_audio_window(&window)?;
    if !manager.is_live() {
        return Err("Start External Soundboard before opening its overlay.".into());
    }
    crate::soundboard_overlay::browse(&app)
}

#[tauri::command]
pub fn external_audio_hide_overlay(window: WebviewWindow) -> Result<(), String> {
    ensure_audio_window(&window)?;
    crate::soundboard_overlay::cancel(window.app_handle());
    Ok(())
}

pub fn setup(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut last_state: Option<SessionState> = None;
        loop {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let manager = app.state::<ExternalAudioManager>();
            let mut state = manager.state();
            if is_new_failure(&state, last_state.as_ref()) {
                emit_failure(&app, failure_from_state(&state));
                state = manager.release_after_failure();
                destroy_overlay(&app);
                crate::shell::reveal_main_window(&app);
            }
            if last_state.as_ref() != Some(&state) {
                emit_state(&app, &state);
                last_state = Some(state.clone());
            }
            if matches!(state.status, SessionStatus::Testing | SessionStatus::Live) {
                let levels = manager.engine.levels();
                emit_levels(&app, levels);
            }
        }
    });
}

pub fn show_overlay_window(app: &AppHandle) -> Result<(), String> {
    let overlay = match app.get_webview_window(OVERLAY_WINDOW) {
        Some(window) => window,
        None => WebviewWindowBuilder::new(
            app,
            OVERLAY_WINDOW,
            WebviewUrl::App("index.html?window=external-soundboard".into()),
        )
        .title("Bakbak Sound Wheel")
        .inner_size(900.0, 700.0)
        .visible(false)
        .transparent(true)
        .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .decorations(false)
        .resizable(false)
        .shadow(false)
        .skip_taskbar(true)
        .build()
        .map_err(|error| error.to_string())?,
    };
    // Borderless monitor-sized overlay avoids creating a separate macOS
    // fullscreen Space. Position in physical pixels, including mixed-DPI setups.
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|point| app.monitor_from_point(point.x, point.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        overlay
            .set_position(*monitor.position())
            .map_err(|error| error.to_string())?;
        overlay
            .set_size(*monitor.size())
            .map_err(|error| error.to_string())?;
    }
    overlay.show().map_err(|error| error.to_string())?;
    overlay.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn external_audio_selection_feedback(
    window: WebviewWindow,
    manager: State<'_, ExternalAudioManager>,
) -> Result<(), String> {
    ensure_audio_window(&window)?;
    manager.engine.selection_feedback();
    Ok(())
}

pub fn hide_overlay_on_close(window: &Window) {
    crate::soundboard_overlay::cancel(window.app_handle());
}

pub fn destroy_overlay(app: &AppHandle) {
    crate::soundboard_overlay::cancel(app);
    if let Some(overlay) = app.get_webview_window(OVERLAY_WINDOW) {
        let _ = overlay.destroy();
    }
}

pub fn stop_for_shutdown(app: &AppHandle) {
    let manager = app.state::<ExternalAudioManager>();
    let state = manager.stop();
    destroy_overlay(app);
    emit_state(app, &state);
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn suspend_for_sleep(app: &AppHandle) {
    let manager = app.state::<ExternalAudioManager>();
    if session_requires_suspend(manager.state().status) {
        let state = manager.suspend();
        destroy_overlay(app);
        emit_state(app, &state);
    }
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn session_requires_suspend(status: SessionStatus) -> bool {
    matches!(
        status,
        SessionStatus::Starting | SessionStatus::Testing | SessionStatus::Live
    )
}

fn emit_state(app: &AppHandle, state: &SessionState) {
    let _ = app.emit(STATE_EVENT, state);
    if let Some(tray) = app.tray_by_id("bakbak") {
        let tooltip = if state.status == SessionStatus::Live {
            "Bakbak · External Mic LIVE"
        } else {
            "Bakbak"
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn emit_levels(app: &AppHandle, levels: Levels) {
    let _ = app.emit(LEVELS_EVENT, levels);
}

fn emit_failure(app: &AppHandle, failure: ExternalAudioFailure) {
    let _ = app.emit(FAILURE_EVENT, failure);
}

fn failure_from_state(state: &SessionState) -> ExternalAudioFailure {
    let code = state
        .error_code
        .as_deref()
        .map(bounded_failure_code)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "native-audio-error".into());
    let message = state
        .message
        .as_deref()
        .map(bounded_failure_message)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "External Soundboard stopped after a native audio failure.".into());
    ExternalAudioFailure { code, message }
}

fn is_new_failure(state: &SessionState, previous: Option<&SessionState>) -> bool {
    state.status == SessionStatus::Error
        && previous.map(|value| value.status) != Some(SessionStatus::Error)
}

fn bounded_failure_code(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(MAX_FAILURE_CODE_CHARS)
        .collect()
}

fn bounded_failure_message(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .take(MAX_FAILURE_MESSAGE_CHARS)
        .collect::<String>()
        .trim()
        .to_string()
}

fn ensure_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == MAIN_WINDOW {
        Ok(())
    } else {
        Err("This external-audio action is available only in Bakbak's main window.".into())
    }
}

fn ensure_audio_window(window: &WebviewWindow) -> Result<(), String> {
    if matches!(window.label(), MAIN_WINDOW | OVERLAY_WINDOW) {
        Ok(())
    } else {
        Err("This window cannot control external audio.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm_contract_is_locked_to_the_native_mix_rate() {
        assert_eq!(MIX_SAMPLE_RATE, 48_000);
    }

    #[test]
    fn external_sound_deserialization_rejects_samples_over_the_native_bound() {
        use serde::de::value::{Error, SeqDeserializer};

        let samples = std::iter::repeat_n(0.0_f32, MAX_SOUND_SAMPLES + 1);
        let deserializer = SeqDeserializer::<_, Error>::new(samples);

        assert!(deserialize_sound_samples(deserializer).is_err());
    }

    #[test]
    fn sound_id_deserialization_rejects_oversized_and_control_char_values() {
        use serde::de::value::{Error, StrDeserializer};

        let oversized = "x".repeat(MAX_SOUND_ID_BYTES + 1);
        let oversized_deserializer = StrDeserializer::<Error>::new(&oversized);
        let control_deserializer = StrDeserializer::<Error>::new("sound\nidentifier");

        assert!(deserialize_sound_id(oversized_deserializer).is_err());
        assert!(deserialize_sound_id(control_deserializer).is_err());
    }

    #[test]
    fn native_failures_are_bounded_and_control_character_free() {
        let failure = failure_from_state(&SessionState {
            status: SessionStatus::Error,
            config: None,
            microphone_muted: true,
            active_sound_id: None,
            error_code: Some(format!("input-device-lost!{}", "x".repeat(100))),
            message: Some(format!("Disconnected\n{}", "x".repeat(600))),
        });

        assert!(failure.code.chars().count() <= MAX_FAILURE_CODE_CHARS);
        assert!(
            failure.code.chars().all(
                |character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            )
        );
        assert!(failure.message.chars().count() <= MAX_FAILURE_MESSAGE_CHARS);
        assert!(!failure.message.chars().any(char::is_control));
    }

    #[test]
    fn failure_transition_notifies_once_until_audio_recovers() {
        let error = SessionState {
            status: SessionStatus::Error,
            ..SessionState::default()
        };
        let live = SessionState {
            status: SessionStatus::Live,
            ..SessionState::default()
        };

        assert!(is_new_failure(&error, Some(&live)));
        assert!(!is_new_failure(&error, Some(&error)));
        assert!(!is_new_failure(&live, Some(&error)));
    }

    #[test]
    fn sleep_suspends_every_session_that_can_own_native_devices() {
        for status in [
            SessionStatus::Starting,
            SessionStatus::Testing,
            SessionStatus::Live,
        ] {
            assert!(session_requires_suspend(status));
        }
        for status in [
            SessionStatus::Idle,
            SessionStatus::Stopping,
            SessionStatus::Suspended,
            SessionStatus::Error,
        ] {
            assert!(!session_requires_suspend(status));
        }
    }
}
