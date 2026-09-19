use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_shell::{
    ShellExt,
    process::{CommandChild, CommandEvent},
};
use tokio::sync::{Mutex as AsyncMutex, oneshot};

const PROTOCOL_VERSION: u32 = 1;
const HELPER_NAME: &str = "bakbak-screen-share-helper";
const LIFECYCLE_EVENT: &str = "screen-share:lifecycle";
const MAX_LINE_BYTES: usize = 32 * 1024 * 1024;
const MAX_TOKEN_BYTES: usize = 16 * 1024;
const MAX_SOURCES: usize = 256;
#[cfg(any(target_os = "windows", test))]
const WINDOWS_AUDIO_PROOF_LOST_MESSAGE: &str =
    "Bakbak could no longer prove its Windows webview audio processes. Video is still sharing.";

#[derive(Clone, Default)]
pub struct ScreenShareManager {
    shared: Arc<Shared>,
}

#[derive(Default)]
struct Shared {
    operation: AsyncMutex<()>,
    next_request_id: AtomicU64,
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    child: Option<CommandChild>,
    child_pid: Option<u32>,
    audio_root_pid: Option<u32>,
    audio_identity_epoch: u64,
    helper_version: Option<String>,
    pending: HashMap<String, PendingRequest>,
    active_session_id: Option<String>,
    active_audio_published: bool,
    identity_stale: bool,
}

struct PendingRequest {
    command: HelperCommand,
    sender: oneshot::Sender<Result<Value, String>>,
}

#[derive(Debug, PartialEq)]
enum HelperResponseResult {
    Success(Value),
    HelperFailure(String),
    ProtocolViolation,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum HelperCommand {
    Hello,
    Capabilities,
    ListSources,
    Start,
    Update,
    DisableAudio,
    Stop,
    Shutdown,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, PartialEq, Eq)]
enum AudioRootChangeAction {
    None,
    ResetIdleHelper,
    DisableActiveAudio(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestEnvelope<'a> {
    protocol_version: u32,
    request_id: &'a str,
    command: HelperCommand,
    payload: Value,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum OutboundEnvelope {
    Event(EventEnvelope),
    Response(ResponseEnvelope),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResponseEnvelope {
    protocol_version: u32,
    request_id: String,
    ok: bool,
    result: Option<Value>,
    error: Option<ResponseError>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResponseError {
    code: String,
    message: String,
    retryable: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventEnvelope {
    protocol_version: u32,
    event: String,
    payload: LifecyclePayload,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LifecyclePayload {
    session_id: Option<String>,
    state: LifecycleState,
    reason_code: Option<String>,
    message: Option<String>,
    audio_published: Option<bool>,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum LifecycleState {
    Ready,
    Starting,
    Live,
    AudioDowngraded,
    Stopping,
    Stopped,
    Failed,
    ShuttingDown,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptureSettings {
    width: u32,
    height: u32,
    frame_rate: u32,
    max_bitrate: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListSourcesInput {
    #[serde(default)]
    include_thumbnails: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartInput {
    server_url: String,
    token: String,
    source_id: String,
    include_audio: bool,
    settings: CaptureSettings,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateInput {
    session_id: String,
    settings: Option<CaptureSettings>,
    paused: Option<bool>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StopInput {
    session_id: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareHostIdentity {
    shell: &'static str,
    generation: u8,
    protocol_version: u32,
    helper_version: Option<String>,
    app_version: String,
    audio_root_kind: &'static str,
    proof: &'static str,
    identity_epoch: u64,
}

impl ScreenShareManager {
    async fn request(
        &self,
        app: &AppHandle,
        command: HelperCommand,
        payload: Value,
    ) -> Result<Value, String> {
        let _operation = self.shared.operation.lock().await;
        self.ensure_started(app).await?;
        self.send_request(app, command, payload).await
    }

    async fn ensure_started(&self, app: &AppHandle) -> Result<(), String> {
        let (audio_root_pid, audio_identity_epoch) = current_audio_identity(app);
        let identity_changed = {
            let inner = self.lock_inner();
            inner.child.is_some()
                && inner.active_session_id.is_none()
                && (inner.identity_stale
                    || inner.audio_root_pid != audio_root_pid
                    || inner.audio_identity_epoch != audio_identity_epoch)
        };
        if identity_changed {
            self.reset_child(
                app,
                None,
                "The native screen-share host identity changed.",
                false,
            );
        }
        if self.lock_inner().child.is_some() {
            return Ok(());
        }

        let command = app
            .shell()
            .sidecar(HELPER_NAME)
            .map_err(|_| "Native screen sharing could not locate its helper.".to_string())?
            .env_clear()
            .envs(helper_environment());
        let (mut events, child) = command
            .spawn()
            .map_err(|_| "Native screen sharing could not start.".to_string())?;
        let child_pid = child.pid();
        {
            let mut inner = self.lock_inner();
            inner.child_pid = Some(child_pid);
            inner.audio_root_pid = audio_root_pid;
            inner.audio_identity_epoch = audio_identity_epoch;
            inner.helper_version = None;
            inner.identity_stale = false;
            inner.child = Some(child);
        }
        let manager = self.clone();
        let event_app = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        if manager.consume_line(&event_app, child_pid, &line).is_err() {
                            manager.reset_child(
                                &event_app,
                                Some(child_pid),
                                "Native screen sharing returned an invalid response.",
                                true,
                            );
                            break;
                        }
                    }
                    CommandEvent::Stderr(_) => {}
                    CommandEvent::Error(_) | CommandEvent::Terminated(_) => {
                        manager.reset_child(
                            &event_app,
                            Some(child_pid),
                            "Native screen sharing ended unexpectedly.",
                            true,
                        );
                        break;
                    }
                    _ => {}
                }
            }
        });

        let hello = json!({
            "hostRootPid": std::process::id(),
            "audioRootPid": audio_root_pid,
            "bundleId": app.config().identifier,
            "appVersion": app.package_info().version.to_string(),
        });
        match self.send_request(app, HelperCommand::Hello, hello).await {
            Ok(result) => {
                let helper_version = result
                    .get("helperVersion")
                    .and_then(Value::as_str)
                    .expect("validated helper version")
                    .to_string();
                let current_identity = current_audio_identity(app);
                let identity_valid = {
                    let mut inner = self.lock_inner();
                    let valid = inner.child_pid == Some(child_pid)
                        && !inner.identity_stale
                        && (inner.audio_root_pid, inner.audio_identity_epoch) == current_identity;
                    if valid {
                        inner.helper_version = Some(helper_version);
                    }
                    valid
                };
                if identity_valid {
                    Ok(())
                } else {
                    self.reset_child(
                        app,
                        Some(child_pid),
                        "The native screen-share host identity changed during startup.",
                        false,
                    );
                    Err("The native screen-share host identity changed during startup.".into())
                }
            }
            Err(error) => {
                self.reset_child(
                    app,
                    Some(child_pid),
                    "Native screen sharing could not verify its host.",
                    false,
                );
                Err(error)
            }
        }
    }

    async fn send_request(
        &self,
        app: &AppHandle,
        command: HelperCommand,
        payload: Value,
    ) -> Result<Value, String> {
        let request_id =
            (self.shared.next_request_id.fetch_add(1, Ordering::Relaxed) + 1).to_string();
        let mut encoded = serde_json::to_vec(&RequestEnvelope {
            protocol_version: PROTOCOL_VERSION,
            request_id: &request_id,
            command,
            payload,
        })
        .map_err(|_| "Native screen sharing could not encode its request.".to_string())?;
        encoded.push(b'\n');
        if encoded.len() > MAX_LINE_BYTES {
            return Err("The native screen-share request is too large.".into());
        }
        let (sender, receiver) = oneshot::channel();
        let write_failed = {
            let mut inner = self.lock_inner();
            inner
                .pending
                .insert(request_id.clone(), PendingRequest { command, sender });
            let Some(child) = inner.child.as_mut() else {
                inner.pending.remove(&request_id);
                return Err("Native screen sharing is unavailable.".into());
            };
            if child.write(&encoded).is_err() {
                inner.pending.remove(&request_id);
                true
            } else {
                false
            }
        };
        if write_failed {
            self.reset_child(
                app,
                None,
                "Native screen sharing could not receive the request.",
                true,
            );
            return Err("Native screen sharing could not receive the request.".into());
        }
        match tokio::time::timeout(command_timeout(command), receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Native screen sharing ended unexpectedly.".into()),
            Err(_) => {
                self.lock_inner().pending.remove(&request_id);
                let message = format!(
                    "Native screen sharing timed out during {}.",
                    command_label(command)
                );
                self.reset_child(app, None, &message, true);
                Err(message)
            }
        }
    }

    fn consume_line(&self, app: &AppHandle, child_pid: u32, line: &[u8]) -> Result<(), ()> {
        if line.is_empty() || line.len() > MAX_LINE_BYTES {
            return Err(());
        }
        let envelope = serde_json::from_slice::<OutboundEnvelope>(line).map_err(|_| ())?;
        match envelope {
            OutboundEnvelope::Event(event) => {
                if event.protocol_version != PROTOCOL_VERSION || event.event != "lifecycle" {
                    return Err(());
                }
                validate_lifecycle(&event.payload)?;
                {
                    let mut inner = self.lock_inner();
                    if inner.child_pid != Some(child_pid) {
                        return Ok(());
                    }
                    match event.payload.state {
                        LifecycleState::Live => {
                            inner.active_session_id = event.payload.session_id.clone();
                            inner.active_audio_published =
                                event.payload.audio_published == Some(true);
                        }
                        LifecycleState::AudioDowngraded => {
                            inner.active_session_id = event.payload.session_id.clone();
                            inner.active_audio_published = false;
                            inner.identity_stale = true;
                        }
                        LifecycleState::Stopped | LifecycleState::Failed => {
                            inner.active_session_id = None;
                            inner.active_audio_published = false;
                        }
                        _ => {}
                    }
                }
                app.emit(LIFECYCLE_EVENT, event.payload).map_err(|_| ())?;
            }
            OutboundEnvelope::Response(response) => {
                if response.protocol_version != PROTOCOL_VERSION
                    || response.request_id.is_empty()
                    || response.request_id.len() > 128
                {
                    return Err(());
                }
                let pending = self
                    .lock_inner()
                    .pending
                    .remove(&response.request_id)
                    .ok_or(())?;
                match response_result(pending.command, response) {
                    HelperResponseResult::Success(value) => {
                        let _ = pending.sender.send(Ok(value));
                    }
                    HelperResponseResult::HelperFailure(message) => {
                        let _ = pending.sender.send(Err(message));
                    }
                    HelperResponseResult::ProtocolViolation => return Err(()),
                }
            }
        }
        Ok(())
    }

    fn reset_child(
        &self,
        app: &AppHandle,
        expected_pid: Option<u32>,
        message: &str,
        emit_failure: bool,
    ) {
        let (child, pending, session_id) = {
            let mut inner = self.lock_inner();
            if expected_pid.is_some() && inner.child_pid != expected_pid {
                return;
            }
            let child = inner.child.take();
            inner.child_pid = None;
            inner.audio_root_pid = None;
            inner.audio_identity_epoch = 0;
            inner.helper_version = None;
            let pending = std::mem::take(&mut inner.pending);
            let session_id = inner.active_session_id.take();
            inner.active_audio_published = false;
            inner.identity_stale = false;
            (child, pending, session_id)
        };
        if let Some(child) = child {
            let _ = child.kill();
        }
        for pending in pending.into_values() {
            let _ = pending.sender.send(Err(message.to_string()));
        }
        if emit_failure && session_id.is_some() {
            let _ = app.emit(
                LIFECYCLE_EVENT,
                LifecyclePayload {
                    session_id,
                    state: LifecycleState::Failed,
                    reason_code: Some("helper-exited".into()),
                    message: Some("Native screen sharing ended unexpectedly.".into()),
                    audio_published: Some(false),
                },
            );
        }
    }

    fn kill_for_shutdown(&self, app: &AppHandle) {
        self.reset_child(app, None, "Native screen sharing is shutting down.", false);
    }

    fn active_session_id(&self) -> Option<String> {
        self.lock_inner().active_session_id.clone()
    }

    fn helper_version(&self) -> Option<String> {
        self.lock_inner().helper_version.clone()
    }

    #[cfg(any(target_os = "windows", test))]
    async fn handle_audio_root_change(
        &self,
        app: &AppHandle,
        audio_root_pid: Option<u32>,
        audio_identity_epoch: u64,
    ) {
        // Never queue a fail-closed transition behind Start or Update. If the
        // helper is busy, terminating it is the only immediate way to stop a
        // potentially stale audio capture; an idle control path can preserve
        // video through the internal DisableAudio command below.
        let Ok(_operation) = self.shared.operation.try_lock() else {
            let mut inner = self.lock_inner();
            let helper_running = inner.child.is_some();
            let action = observe_audio_root_change(
                &mut inner,
                helper_running,
                audio_root_pid,
                audio_identity_epoch,
            );
            drop(inner);
            if busy_audio_root_change_requires_reset(&action) {
                self.reset_child(app, None, WINDOWS_AUDIO_PROOF_LOST_MESSAGE, true);
            }
            return;
        };
        // A lexical scope keeps the non-Send guard out of the async state
        // machine before DisableAudio waits for the helper response.
        let action = {
            let mut inner = self.lock_inner();
            let helper_running = inner.child.is_some();
            observe_audio_root_change(
                &mut inner,
                helper_running,
                audio_root_pid,
                audio_identity_epoch,
            )
        };
        match action {
            AudioRootChangeAction::None => {}
            AudioRootChangeAction::ResetIdleHelper => self.reset_child(
                app,
                None,
                "The native screen-share host identity changed.",
                false,
            ),
            AudioRootChangeAction::DisableActiveAudio(session_id) => {
                let result = self
                    .send_request(
                        app,
                        HelperCommand::DisableAudio,
                        json!({ "sessionId": session_id }),
                    )
                    .await;
                if result.is_err() {
                    self.reset_child(app, None, WINDOWS_AUDIO_PROOF_LOST_MESSAGE, true);
                }
            }
        }
    }

    fn lock_inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.shared
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[cfg(any(target_os = "windows", test))]
fn busy_audio_root_change_requires_reset(action: &AudioRootChangeAction) -> bool {
    action != &AudioRootChangeAction::None
}

#[cfg(any(target_os = "windows", test))]
fn observe_audio_root_change(
    inner: &mut Inner,
    helper_running: bool,
    audio_root_pid: Option<u32>,
    audio_identity_epoch: u64,
) -> AudioRootChangeAction {
    if !helper_running
        || (!inner.identity_stale
            && inner.audio_root_pid == audio_root_pid
            && inner.audio_identity_epoch == audio_identity_epoch)
    {
        return AudioRootChangeAction::None;
    }
    inner.identity_stale = true;
    let Some(session_id) = inner.active_session_id.clone() else {
        return AudioRootChangeAction::ResetIdleHelper;
    };
    if !inner.active_audio_published {
        return AudioRootChangeAction::None;
    }
    inner.active_audio_published = false;
    AudioRootChangeAction::DisableActiveAudio(session_id)
}

#[cfg(target_os = "windows")]
pub fn register_windows_audio_root_monitor(
    app: &AppHandle,
    tracker: crate::windows_process::WebViewProcessTracker,
) {
    let mut changes = tracker.subscribe();
    let manager = app.state::<ScreenShareManager>().inner().clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        while changes.changed().await.is_ok() {
            let audio_identity_epoch = tracker.identity_epoch();
            let audio_root_pid = tracker.current_audio_root();
            manager
                .handle_audio_root_change(&app, audio_root_pid, audio_identity_epoch)
                .await;
        }
    });
}

#[tauri::command]
pub async fn screen_share_capabilities(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
) -> Result<Value, String> {
    ensure_main_window(&window)?;
    let isolation_proven = audio_isolation_proven(&app);
    let mut result = manager
        .request(&app, HelperCommand::Capabilities, json!({}))
        .await?;
    if !isolation_proven {
        disable_capability_audio(&mut result);
    }
    Ok(result)
}

#[tauri::command]
pub fn screen_share_host_identity(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
) -> Result<ScreenShareHostIdentity, String> {
    ensure_main_window(&window)?;
    let app_version = app.package_info().version.to_string();
    validate_bounded(&app_version, 1, 64, "app version")?;
    let helper_version = manager.helper_version();
    if helper_version
        .as_deref()
        .is_some_and(|value| validate_bounded(value, 1, 64, "helper version").is_err())
    {
        return Err("The native screen-share helper version is invalid.".into());
    }

    #[cfg(target_os = "windows")]
    let (audio_root_kind, proof, identity_epoch) = {
        let tracker = app.state::<crate::windows_process::WebViewProcessTracker>();
        (
            "webview2",
            if tracker.current_audio_root().is_some() {
                "proven"
            } else {
                "unavailable"
            },
            tracker.identity_epoch(),
        )
    };
    #[cfg(not(target_os = "windows"))]
    let (audio_root_kind, proof, identity_epoch) = ("host-process", "proven", 0);

    Ok(ScreenShareHostIdentity {
        shell: "tauri",
        generation: 2,
        protocol_version: PROTOCOL_VERSION,
        helper_version,
        app_version,
        audio_root_kind,
        proof,
        identity_epoch,
    })
}

#[tauri::command]
pub async fn screen_share_list_sources(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    input: ListSourcesInput,
) -> Result<Value, String> {
    ensure_main_window(&window)?;
    let isolation_proven = audio_isolation_proven(&app);
    let mut result = manager
        .request(
            &app,
            HelperCommand::ListSources,
            serde_json::to_value(input).map_err(|_| "Invalid source request.".to_string())?,
        )
        .await?;
    if !isolation_proven {
        disable_source_audio(&mut result);
    }
    Ok(result)
}

#[tauri::command]
pub fn screen_share_select_source(window: WebviewWindow, source_id: String) -> Result<(), String> {
    ensure_main_window(&window)?;
    validate_bounded(&source_id, 1, 512, "screen source")
}

#[tauri::command]
pub async fn screen_share_start(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    mut input: StartInput,
) -> Result<Value, String> {
    ensure_main_window(&window)?;
    validate_start(&input)?;
    input.include_audio &= audio_isolation_proven(&app);
    manager
        .request(
            &app,
            HelperCommand::Start,
            serde_json::to_value(input).map_err(|_| "Invalid screen-share request.".to_string())?,
        )
        .await
}

#[tauri::command]
pub async fn screen_share_update(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    input: UpdateInput,
) -> Result<Value, String> {
    ensure_main_window(&window)?;
    validate_session(&input.session_id)?;
    if input.settings.is_none() && input.paused.is_none() {
        return Err("Choose a screen-share setting to update.".into());
    }
    if let Some(settings) = input.settings {
        validate_settings(settings)?;
    }
    ensure_active_session(&manager, &input.session_id)?;
    manager
        .request(
            &app,
            HelperCommand::Update,
            serde_json::to_value(input).map_err(|_| "Invalid screen-share update.".to_string())?,
        )
        .await
}

#[tauri::command]
pub async fn screen_share_stop(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, ScreenShareManager>,
    input: StopInput,
) -> Result<Value, String> {
    ensure_main_window(&window)?;
    validate_session(&input.session_id)?;
    ensure_active_session(&manager, &input.session_id)?;
    manager
        .request(
            &app,
            HelperCommand::Stop,
            serde_json::to_value(input).map_err(|_| "Invalid screen-share stop.".to_string())?,
        )
        .await
}

pub fn stop_for_shutdown(app: &AppHandle) {
    app.state::<ScreenShareManager>().kill_for_shutdown(app);
}

fn response_result(command: HelperCommand, response: ResponseEnvelope) -> HelperResponseResult {
    if response.ok {
        if response.error.is_some() {
            return HelperResponseResult::ProtocolViolation;
        }
        let Some(result) = response.result else {
            return HelperResponseResult::ProtocolViolation;
        };
        if validate_result(command, &result).is_err() {
            return HelperResponseResult::ProtocolViolation;
        }
        HelperResponseResult::Success(result)
    } else {
        if response.result.is_some() {
            return HelperResponseResult::ProtocolViolation;
        }
        let Some(error) = response.error else {
            return HelperResponseResult::ProtocolViolation;
        };
        if !valid_error(&error) {
            return HelperResponseResult::ProtocolViolation;
        }
        HelperResponseResult::HelperFailure(format!(
            "Native screen sharing failed ({}).",
            error.code
        ))
    }
}

fn validate_result(command: HelperCommand, value: &Value) -> Result<(), ()> {
    match command {
        HelperCommand::Hello => {
            let object = value.as_object().ok_or(())?;
            if object.get("protocolVersion") != Some(&json!(PROTOCOL_VERSION))
                || !bounded_json_string(object.get("helperVersion"), 1, 64)
                || !matches!(
                    object.get("platform").and_then(Value::as_str),
                    Some("macos" | "windows" | "unsupported")
                )
            {
                return Err(());
            }
            validate_capabilities(object.get("capabilities").ok_or(())?)
        }
        HelperCommand::Capabilities => validate_capabilities(value),
        HelperCommand::ListSources => validate_source_result(value),
        HelperCommand::Start => validate_start_result(value),
        HelperCommand::Update => validate_update_result(value),
        HelperCommand::DisableAudio => validate_disable_audio_result(value),
        HelperCommand::Stop => validate_stop_result(value),
        HelperCommand::Shutdown => (value.get("accepted") == Some(&Value::Bool(true)))
            .then_some(())
            .ok_or(()),
    }
}

fn validate_capabilities(value: &Value) -> Result<(), ()> {
    let object = value.as_object().ok_or(())?;
    if [
        "video",
        "systemAudio",
        "applicationAudio",
        "processTreeIsolation",
    ]
    .iter()
    .any(|key| !object.get(*key).is_some_and(Value::is_boolean))
        || !nullable_bounded_json_string(object.get("minOsVersion"), 128)
        || !nullable_bounded_json_string(object.get("reason"), 512)
    {
        return Err(());
    }
    Ok(())
}

fn validate_source_result(value: &Value) -> Result<(), ()> {
    let object = value.as_object().ok_or(())?;
    let sources = object.get("sources").and_then(Value::as_array).ok_or(())?;
    if sources.len() > MAX_SOURCES || !object.get("truncated").is_some_and(Value::is_boolean) {
        return Err(());
    }
    for source in sources {
        let source = source.as_object().ok_or(())?;
        if !bounded_json_string(source.get("id"), 1, 512)
            || !matches!(
                source.get("kind").and_then(Value::as_str),
                Some("display" | "application")
            )
            || !bounded_json_string(source.get("label"), 1, 512)
            || !nullable_bounded_json_string(source.get("applicationLabel"), 512)
            || !source.get("audioAvailable").is_some_and(Value::is_boolean)
            || !nullable_bounded_json_string(source.get("audioUnavailableReason"), 512)
            || !nullable_bounded_json_string(source.get("thumbnailDataUrl"), 4 * 1024 * 1024)
        {
            return Err(());
        }
    }
    Ok(())
}

fn validate_start_result(value: &Value) -> Result<(), ()> {
    let object = value.as_object().ok_or(())?;
    validate_uuid_json(object.get("sessionId"))?;
    if !bounded_json_string(object.get("sourceLabel"), 1, 512)
        || !matches!(
            object.get("sourceKind").and_then(Value::as_str),
            Some("display" | "application")
        )
        || !object.get("audioPublished").is_some_and(Value::is_boolean)
        || !nullable_bounded_json_string(object.get("audioUnavailableReason"), 512)
    {
        return Err(());
    }
    validate_settings_json(object.get("settings").ok_or(())?)?;
    let diagnostics = object
        .get("diagnostics")
        .and_then(Value::as_object)
        .ok_or(())?;
    if !bounded_json_string(diagnostics.get("captureBackend"), 1, 128)
        || !matches!(
            diagnostics
                .get("audioIsolationMode")
                .and_then(Value::as_str),
            Some("disabled" | "exclude-bakbak-process-tree" | "include-selected-process-tree")
        )
    {
        return Err(());
    }
    Ok(())
}

fn validate_update_result(value: &Value) -> Result<(), ()> {
    let object = value.as_object().ok_or(())?;
    validate_uuid_json(object.get("sessionId"))?;
    if !object.get("paused").is_some_and(Value::is_boolean) {
        return Err(());
    }
    validate_settings_json(object.get("settings").ok_or(())?)
}

fn validate_stop_result(value: &Value) -> Result<(), ()> {
    let object = value.as_object().ok_or(())?;
    validate_uuid_json(object.get("sessionId"))?;
    (object.get("stopped") == Some(&Value::Bool(true)))
        .then_some(())
        .ok_or(())
}

fn validate_disable_audio_result(value: &Value) -> Result<(), ()> {
    let object = value.as_object().ok_or(())?;
    validate_uuid_json(object.get("sessionId"))?;
    (object.get("audioPublished") == Some(&Value::Bool(false)))
        .then_some(())
        .ok_or(())
}

fn validate_lifecycle(payload: &LifecyclePayload) -> Result<(), ()> {
    if payload
        .session_id
        .as_deref()
        .is_some_and(|value| uuid::Uuid::parse_str(value).is_err())
        || payload
            .reason_code
            .as_deref()
            .is_some_and(|value| value.len() > 128)
        || payload
            .message
            .as_deref()
            .is_some_and(|value| value.len() > 512)
    {
        return Err(());
    }
    if matches!(
        payload.state,
        LifecycleState::Live | LifecycleState::AudioDowngraded
    ) && payload.session_id.is_none()
    {
        return Err(());
    }
    Ok(())
}

fn validate_start(input: &StartInput) -> Result<(), String> {
    validate_bounded(&input.source_id, 1, 512, "screen source")?;
    validate_bounded(&input.token, 1, MAX_TOKEN_BYTES, "screen-share credential")?;
    if input.token.contains(['\n', '\r']) || input.token.split('.').count() != 3 {
        return Err("The screen-share credential is invalid.".into());
    }
    validate_bounded(&input.server_url, 1, 2_048, "LiveKit server")?;
    let server = url::Url::parse(&input.server_url)
        .map_err(|_| "The LiveKit server URL is invalid.".to_string())?;
    if server.scheme() != "wss"
        || server.host_str().is_none()
        || !server.username().is_empty()
        || server.password().is_some()
        || server.fragment().is_some()
    {
        return Err("The LiveKit server must be a credential-free wss URL.".into());
    }
    validate_settings(input.settings)
}

fn validate_settings(settings: CaptureSettings) -> Result<(), String> {
    let bitrate = match (settings.width, settings.height, settings.frame_rate) {
        (854, 480, 15) => 800_000,
        (854, 480, 30) => 1_500_000,
        (854, 480, 60) => 2_500_000,
        (1280, 720, 15) => 1_500_000,
        (1280, 720, 30) => 2_000_000,
        (1280, 720, 60) => 4_000_000,
        (1920, 1080, 15) => 2_500_000,
        (1920, 1080, 30) => 5_000_000,
        (1920, 1080, 60) => 8_000_000,
        _ => 0,
    };
    if bitrate == settings.max_bitrate && bitrate != 0 {
        Ok(())
    } else {
        Err("The requested screen-share quality is unsupported.".into())
    }
}

fn validate_settings_json(value: &Value) -> Result<(), ()> {
    serde_json::from_value::<CaptureSettings>(value.clone())
        .map_err(|_| ())
        .and_then(|settings| validate_settings(settings).map_err(|_| ()))
}

fn validate_session(value: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| "The screen-share session identifier is invalid.".into())
}

fn ensure_active_session(manager: &ScreenShareManager, session_id: &str) -> Result<(), String> {
    if manager.active_session_id().as_deref() == Some(session_id) {
        Ok(())
    } else {
        Err("That screen-share session is no longer active.".into())
    }
}

fn ensure_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("This screen-share action is available only in Bakbak's main window.".into())
    }
}

fn audio_isolation_proven(app: &AppHandle) -> bool {
    #[cfg(target_os = "windows")]
    {
        app.state::<crate::windows_process::WebViewProcessTracker>()
            .current_audio_root()
            .is_some()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        true
    }
}

fn current_audio_identity(app: &AppHandle) -> (Option<u32>, u64) {
    #[cfg(target_os = "windows")]
    {
        let tracker = app.state::<crate::windows_process::WebViewProcessTracker>();
        (tracker.current_audio_root(), tracker.identity_epoch())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        (None, 0)
    }
}

fn disable_capability_audio(value: &mut Value) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    object.insert("systemAudio".into(), Value::Bool(false));
    object.insert("applicationAudio".into(), Value::Bool(false));
    object.insert("processTreeIsolation".into(), Value::Bool(false));
    object.insert(
        "reason".into(),
        Value::String(
            "Bakbak could not prove every native webview audio process, so sharing is video-only."
                .into(),
        ),
    );
}

fn disable_source_audio(value: &mut Value) {
    let Some(sources) = value.get_mut("sources").and_then(Value::as_array_mut) else {
        return;
    };
    for source in sources {
        let Some(source) = source.as_object_mut() else {
            continue;
        };
        source.insert("audioAvailable".into(), Value::Bool(false));
        source.insert(
            "audioUnavailableReason".into(),
            Value::String(
                "Bakbak could not prove every native webview audio process, so sharing is video-only."
                    .into(),
            ),
        );
    }
}

fn helper_environment() -> Vec<(String, String)> {
    [
        "PATH",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "SSL_CERT_FILE",
    ]
    .into_iter()
    .filter_map(|name| std::env::var(name).ok().map(|value| (name.into(), value)))
    .collect()
}

fn command_timeout(command: HelperCommand) -> Duration {
    Duration::from_secs(match command {
        HelperCommand::Hello => 5,
        HelperCommand::Start => 30,
        _ => 15,
    })
}

fn command_label(command: HelperCommand) -> &'static str {
    match command {
        HelperCommand::Hello => "hello",
        HelperCommand::Capabilities => "capabilities",
        HelperCommand::ListSources => "listSources",
        HelperCommand::Start => "start",
        HelperCommand::Update => "update",
        HelperCommand::DisableAudio => "disableAudio",
        HelperCommand::Stop => "stop",
        HelperCommand::Shutdown => "shutdown",
    }
}

fn validate_bounded(value: &str, min: usize, max: usize, label: &str) -> Result<(), String> {
    if value.len() >= min && value.len() <= max && !value.contains(['\n', '\r']) {
        Ok(())
    } else {
        Err(format!("The {label} is invalid."))
    }
}

fn valid_error(error: &ResponseError) -> bool {
    !error.code.is_empty()
        && error.code.len() <= 128
        && !error.code.chars().any(char::is_control)
        && !error.message.is_empty()
        && error.message.len() <= 512
        && !error.message.chars().any(char::is_control)
        && {
            let _ = error.retryable;
            true
        }
}

fn bounded_json_string(value: Option<&Value>, min: usize, max: usize) -> bool {
    value
        .and_then(Value::as_str)
        .is_some_and(|value| value.len() >= min && value.len() <= max)
}

fn nullable_bounded_json_string(value: Option<&Value>, max: usize) -> bool {
    matches!(value, Some(Value::Null))
        || value
            .and_then(Value::as_str)
            .is_some_and(|value| value.len() <= max)
}

fn validate_uuid_json(value: Option<&Value>) -> Result<(), ()> {
    value
        .and_then(Value::as_str)
        .filter(|value| uuid::Uuid::parse_str(value).is_ok())
        .map(|_| ())
        .ok_or(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_root_change_future_is_send() {
        fn assert_send<T: Send>(_: T) {}
        // Type-check the Windows background task on every test platform without
        // starting a desktop runtime or accessing a real capture process.
        let _check = |manager: &ScreenShareManager, app: &AppHandle| {
            assert_send(manager.handle_audio_root_change(app, None, 0));
        };
    }

    #[test]
    fn validates_every_supported_quality_and_rejects_mismatched_bitrate() {
        assert!(
            validate_settings(CaptureSettings {
                width: 1920,
                height: 1080,
                frame_rate: 30,
                max_bitrate: 5_000_000,
            })
            .is_ok()
        );
        assert!(
            validate_settings(CaptureSettings {
                width: 1920,
                height: 1080,
                frame_rate: 30,
                max_bitrate: 4_000_000,
            })
            .is_err()
        );
    }

    #[test]
    fn rejects_tokens_urls_and_sessions_before_native_invocation() {
        let input = StartInput {
            server_url: "https://example.test".into(),
            token: "one.two.three".into(),
            source_id: "display:1".into(),
            include_audio: true,
            settings: CaptureSettings {
                width: 1280,
                height: 720,
                frame_rate: 30,
                max_bitrate: 2_000_000,
            },
        };
        assert!(validate_start(&input).is_err());
        assert!(validate_session("not-a-session").is_err());
    }

    #[test]
    fn fail_closed_rewrite_removes_all_audio_claims() {
        let mut capabilities = json!({
            "video": true,
            "systemAudio": true,
            "applicationAudio": true,
            "processTreeIsolation": true,
            "minOsVersion": "20348",
            "reason": null,
        });
        disable_capability_audio(&mut capabilities);
        assert_eq!(capabilities["video"], true);
        assert_eq!(capabilities["systemAudio"], false);
        assert_eq!(capabilities["processTreeIsolation"], false);

        let mut sources = json!({"sources": [{
            "audioAvailable": true,
            "audioUnavailableReason": null,
        }]});
        disable_source_audio(&mut sources);
        assert_eq!(sources["sources"][0]["audioAvailable"], false);
    }

    #[test]
    fn rejects_success_envelopes_with_failure_fields_or_invalid_results() {
        let response = ResponseEnvelope {
            protocol_version: PROTOCOL_VERSION,
            request_id: "1".into(),
            ok: true,
            result: Some(json!({"stopped": true, "sessionId": "not-a-uuid"})),
            error: None,
        };
        assert_eq!(
            response_result(HelperCommand::Stop, response),
            HelperResponseResult::ProtocolViolation
        );
    }

    #[test]
    fn malformed_start_result_signals_protocol_reset_instead_of_helper_failure() {
        let response = ResponseEnvelope {
            protocol_version: PROTOCOL_VERSION,
            request_id: "start-1".into(),
            ok: true,
            result: Some(json!({
                "sessionId": "not-a-uuid",
                "sourceLabel": "Entire screen",
                "sourceKind": "display",
                "audioPublished": true,
            })),
            error: None,
        };

        assert_eq!(
            response_result(HelperCommand::Start, response),
            HelperResponseResult::ProtocolViolation
        );
    }

    #[test]
    fn malformed_error_envelope_signals_reset_but_valid_helper_error_does_not() {
        let malformed = ResponseEnvelope {
            protocol_version: PROTOCOL_VERSION,
            request_id: "stop-1".into(),
            ok: false,
            result: None,
            error: Some(ResponseError {
                code: "stale-session".into(),
                message: "bad\nmessage".into(),
                retryable: false,
            }),
        };
        assert_eq!(
            response_result(HelperCommand::Stop, malformed),
            HelperResponseResult::ProtocolViolation
        );

        let valid = ResponseEnvelope {
            protocol_version: PROTOCOL_VERSION,
            request_id: "stop-2".into(),
            ok: false,
            result: None,
            error: Some(ResponseError {
                code: "stale-session".into(),
                message: "That screen-share session is no longer active.".into(),
                retryable: false,
            }),
        };
        assert!(matches!(
            response_result(HelperCommand::Stop, valid),
            HelperResponseResult::HelperFailure(_)
        ));
    }

    #[test]
    fn lifecycle_requires_a_session_for_live_and_bounds_messages() {
        assert!(
            validate_lifecycle(&LifecyclePayload {
                session_id: None,
                state: LifecycleState::Live,
                reason_code: None,
                message: None,
                audio_published: Some(true),
            })
            .is_err()
        );
        assert!(
            validate_lifecycle(&LifecyclePayload {
                session_id: None,
                state: LifecycleState::Ready,
                reason_code: None,
                message: Some("x".repeat(513)),
                audio_published: None,
            })
            .is_err()
        );
    }

    #[test]
    fn unavailable_audio_root_downgrades_once_without_ending_video() {
        let session_id = "00000000-0000-4000-8000-000000000001".to_string();
        let mut inner = Inner {
            audio_root_pid: Some(41),
            audio_identity_epoch: 1,
            active_session_id: Some(session_id.clone()),
            active_audio_published: true,
            ..Inner::default()
        };

        assert_eq!(
            observe_audio_root_change(&mut inner, true, None, 2),
            AudioRootChangeAction::DisableActiveAudio(session_id.clone())
        );
        assert_eq!(
            inner.active_session_id.as_deref(),
            Some(session_id.as_str())
        );
        assert!(!inner.active_audio_published);
        assert!(inner.identity_stale);
        assert_eq!(
            observe_audio_root_change(&mut inner, true, None, 2),
            AudioRootChangeAction::None
        );
    }

    #[test]
    fn changed_audio_root_downgrades_audio_and_rotates_idle_helper() {
        let session_id = "00000000-0000-4000-8000-000000000002".to_string();
        let mut active = Inner {
            audio_root_pid: Some(41),
            audio_identity_epoch: 1,
            active_session_id: Some(session_id.clone()),
            active_audio_published: true,
            ..Inner::default()
        };
        assert_eq!(
            observe_audio_root_change(&mut active, true, Some(52), 2),
            AudioRootChangeAction::DisableActiveAudio(session_id)
        );

        let mut idle = Inner {
            audio_root_pid: Some(41),
            audio_identity_epoch: 1,
            ..Inner::default()
        };
        assert_eq!(
            observe_audio_root_change(&mut idle, true, Some(52), 2),
            AudioRootChangeAction::ResetIdleHelper
        );
    }

    #[test]
    fn coalesced_root_change_while_operation_is_held_still_downgrades() {
        let session_id = "00000000-0000-4000-8000-000000000005".to_string();
        let mut inner = Inner {
            audio_root_pid: Some(41),
            audio_identity_epoch: 7,
            active_session_id: Some(session_id.clone()),
            active_audio_published: true,
            ..Inner::default()
        };

        assert_eq!(
            observe_audio_root_change(&mut inner, true, Some(41), 9),
            AudioRootChangeAction::DisableActiveAudio(session_id)
        );
        assert!(inner.identity_stale);
        assert!(!inner.active_audio_published);
        assert!(inner.active_session_id.is_some());
    }

    #[test]
    fn root_loss_while_start_is_blocked_requires_immediate_helper_reset() {
        let manager = ScreenShareManager::default();
        let _start_operation = manager
            .shared
            .operation
            .try_lock()
            .expect("simulated start operation");
        assert!(manager.shared.operation.try_lock().is_err());

        let mut inner = Inner {
            audio_root_pid: Some(41),
            audio_identity_epoch: 7,
            ..Inner::default()
        };
        let action = observe_audio_root_change(&mut inner, true, None, 8);
        assert_eq!(action, AudioRootChangeAction::ResetIdleHelper);
        assert!(busy_audio_root_change_requires_reset(&action));
    }

    #[test]
    fn host_identity_is_sanitized_and_disable_result_requires_audio_off() {
        let identity = ScreenShareHostIdentity {
            shell: "tauri",
            generation: 2,
            protocol_version: PROTOCOL_VERSION,
            helper_version: Some("0.1.0".into()),
            app_version: "2.0.0".into(),
            audio_root_kind: "webview2",
            proof: "proven",
            identity_epoch: 3,
        };
        let value = serde_json::to_value(identity).unwrap();
        assert_eq!(value["identityEpoch"], 3);
        assert!(value.get("audioRootPid").is_none());
        assert!(value.get("path").is_none());
        assert!(value.get("token").is_none());

        let session_id = "00000000-0000-4000-8000-000000000003".to_string();
        assert!(
            validate_disable_audio_result(&json!({
                "sessionId": session_id,
                "audioPublished": false,
            }))
            .is_ok()
        );
        assert!(
            validate_disable_audio_result(&json!({
                "sessionId": "00000000-0000-4000-8000-000000000004",
                "audioPublished": true,
            }))
            .is_err()
        );
    }
}
