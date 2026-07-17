#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback {
    use super::super::{
        SCREEN_SHARE_FRAME_RATES, SCREEN_SHARE_RESOLUTIONS, ScreenShareCapabilities,
    };

    pub fn capabilities() -> ScreenShareCapabilities {
        ScreenShareCapabilities {
            available: false,
            native_capture: false,
            system_audio: false,
            source_kinds: Vec::new(),
            resolutions: SCREEN_SHARE_RESOLUTIONS.to_vec(),
            frame_rates: SCREEN_SHARE_FRAME_RATES.to_vec(),
            dynamic_settings: false,
            custom_picker: false,
            reason: Some("Screen sharing is not supported on this operating system.".to_string()),
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use fallback::*;
