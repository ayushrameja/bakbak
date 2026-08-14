use tokio::sync::mpsc;

use crate::{
    model::{
        AudioIsolationMode, Capabilities, CaptureSettings, HelperError, PlatformName, Source,
        SourceKind,
    },
    policy::HostIdentity,
};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
mod windows_legacy;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod unsupported;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use unsupported::*;

#[derive(Debug)]
pub enum CaptureEvent {
    IsolationLost { code: String, message: String },
    Ended { code: String, message: String },
    Paused(bool),
}

#[derive(Clone)]
pub struct PreparedMetadata {
    pub source_label: String,
    pub source_kind: SourceKind,
    pub width: u32,
    pub height: u32,
    pub audio_requested: bool,
    pub audio_isolation_mode: AudioIsolationMode,
    pub audio_unavailable_reason: Option<String>,
}

#[allow(dead_code)]
pub(crate) fn unavailable() -> HelperError {
    HelperError::invalid(
        "capture-unavailable",
        "Native screen capture is unavailable on this operating system.",
    )
}

#[allow(dead_code)]
pub(crate) fn selected_process_id(source_id: &str) -> Option<u32> {
    source_id
        .strip_prefix("application:")
        .and_then(|value| value.parse().ok())
}

#[allow(dead_code)]
pub(crate) fn display_source(id: String, label: String, audio: bool) -> Source {
    Source {
        id,
        kind: SourceKind::Display,
        label,
        application_label: None,
        audio_available: audio,
        audio_unavailable_reason: (!audio)
            .then(|| "Safe process-tree audio isolation is unavailable.".to_string()),
        thumbnail_data_url: None,
    }
}

#[allow(dead_code)]
pub(crate) type CaptureEventSender = mpsc::UnboundedSender<CaptureEvent>;
