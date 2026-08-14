use serde::Serialize;

#[derive(Clone, Copy)]
pub(crate) struct ScreenShareSettings {
    pub(crate) resolution: u32,
    pub(crate) frame_rate: u32,
}

impl ScreenShareSettings {
    pub(crate) fn from_capture(settings: crate::model::CaptureSettings) -> Self {
        Self {
            resolution: settings.height,
            frame_rate: settings.frame_rate,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ScreenShareSourceKind {
    Display,
    Application,
}

pub(crate) struct ScreenShareCapabilities {
    pub(crate) available: bool,
    pub(crate) native_capture: bool,
    pub(crate) system_audio: bool,
    pub(crate) source_kinds: Vec<ScreenShareSourceKind>,
    pub(crate) resolutions: Vec<u32>,
    pub(crate) frame_rates: Vec<u32>,
    pub(crate) dynamic_settings: bool,
    pub(crate) custom_picker: bool,
    pub(crate) reason: Option<String>,
}

#[derive(Clone)]
pub(crate) struct ScreenShareSource {
    pub(crate) id: String,
    pub(crate) kind: ScreenShareSourceKind,
    pub(crate) label: String,
    pub(crate) application_label: Option<String>,
    pub(crate) audio_available: bool,
    pub(crate) audio_unavailable_reason: Option<String>,
    pub(crate) thumbnail_data_url: Option<String>,
}

pub(crate) const SCREEN_SHARE_RESOLUTIONS: [u32; 3] = [480, 720, 1080];
pub(crate) const SCREEN_SHARE_FRAME_RATES: [u32; 3] = [15, 30, 60];
