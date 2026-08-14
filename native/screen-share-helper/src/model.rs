use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_LINE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_TOKEN_BYTES: usize = 16 * 1024;
pub const MAX_SOURCES: usize = 256;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub protocol_version: u32,
    pub request_id: String,
    pub command: Command,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Command {
    Hello,
    Capabilities,
    ListSources,
    Start,
    Update,
    Stop,
    Shutdown,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HelloPayload {
    pub electron_root_pid: u32,
    pub bundle_id: String,
    pub app_version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelloResult {
    pub protocol_version: u32,
    pub helper_version: String,
    pub platform: PlatformName,
    pub capabilities: Capabilities,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PlatformName {
    Macos,
    Windows,
    Unsupported,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub video: bool,
    pub system_audio: bool,
    pub application_audio: bool,
    pub process_tree_isolation: bool,
    pub min_os_version: Option<String>,
    pub reason: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Display,
    Application,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub kind: SourceKind,
    pub label: String,
    pub application_label: Option<String>,
    pub audio_available: bool,
    pub audio_unavailable_reason: Option<String>,
    pub thumbnail_data_url: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListSourcesPayload {
    #[serde(default)]
    pub include_thumbnails: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSourcesResult {
    pub sources: Vec<Source>,
    pub truncated: bool,
}

pub struct SensitiveToken(String);

impl<'de> Deserialize<'de> for SensitiveToken {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        String::deserialize(deserializer).map(Self)
    }
}

impl SensitiveToken {
    pub fn expose(&self) -> &str {
        &self.0
    }

    pub fn validate(&self) -> Result<(), HelperError> {
        let value = self.0.as_bytes();
        if value.is_empty() || value.len() > MAX_TOKEN_BYTES || value.contains(&b'\n') {
            return Err(HelperError::invalid(
                "invalid-token",
                "The screen-share credential is invalid.",
            ));
        }
        let mut parts = self.0.split('.');
        if parts.next().is_none()
            || parts.next().is_none()
            || parts.next().is_none()
            || parts.next().is_some()
        {
            return Err(HelperError::invalid(
                "invalid-token",
                "The screen-share credential is invalid.",
            ));
        }
        Ok(())
    }
}

impl std::fmt::Debug for SensitiveToken {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SensitiveToken([REDACTED])")
    }
}

impl Drop for SensitiveToken {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptureSettings {
    pub width: u32,
    pub height: u32,
    pub frame_rate: u32,
    pub max_bitrate: u64,
}

impl CaptureSettings {
    pub fn validate(self) -> Result<Self, HelperError> {
        let expected_bitrate = match (self.width, self.height, self.frame_rate) {
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
        if expected_bitrate == 0 || self.max_bitrate != expected_bitrate {
            return Err(HelperError::invalid(
                "invalid-settings",
                "The requested screen-share quality is unsupported.",
            ));
        }
        Ok(self)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartPayload {
    pub server_url: String,
    pub token: SensitiveToken,
    pub source_id: String,
    pub include_audio: bool,
    pub settings: CaptureSettings,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
    pub session_id: String,
    pub source_label: String,
    pub source_kind: SourceKind,
    pub audio_published: bool,
    pub audio_unavailable_reason: Option<String>,
    pub settings: CaptureSettings,
    pub diagnostics: Diagnostics,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub capture_backend: String,
    pub audio_isolation_mode: AudioIsolationMode,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AudioIsolationMode {
    Disabled,
    ExcludeBakbakProcessTree,
    IncludeSelectedProcessTree,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePayload {
    pub session_id: String,
    pub settings: Option<CaptureSettings>,
    pub paused: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub session_id: String,
    pub settings: CaptureSettings,
    pub paused: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StopPayload {
    pub session_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopResult {
    pub session_id: String,
    pub stopped: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecyclePayload {
    pub session_id: Option<String>,
    pub state: LifecycleState,
    pub reason_code: Option<String>,
    pub message: Option<String>,
    pub audio_published: Option<bool>,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LifecycleState {
    Ready,
    Starting,
    Live,
    AudioDowngraded,
    Stopping,
    Stopped,
    Failed,
    ShuttingDown,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HelperError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl HelperError {
    pub fn invalid(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retryable: false,
        }
    }

    pub fn retryable(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retryable: true,
        }
    }
}
