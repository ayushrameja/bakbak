#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
mod fallback {
    use super::super::ScreenShareCapabilities;

    pub fn capabilities() -> ScreenShareCapabilities {
        let windows_video_fallback = cfg!(target_os = "windows");
        ScreenShareCapabilities {
            available: windows_video_fallback,
            native_capture: false,
            system_audio: false,
            reason: Some(if windows_video_fallback {
                "Matched native capture is unavailable; Bakbak will use video-only sharing."
                    .to_string()
            } else {
                "Screen sharing is not supported on this operating system.".to_string()
            }),
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub use fallback::*;
