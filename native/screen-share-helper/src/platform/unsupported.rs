use super::*;

pub struct PreparedCapture;
pub struct CaptureSession;

pub fn platform_name() -> PlatformName {
    PlatformName::Unsupported
}

pub fn capabilities() -> Capabilities {
    Capabilities {
        video: false,
        system_audio: false,
        application_audio: false,
        process_tree_isolation: false,
        min_os_version: None,
        reason: Some("Native screen sharing is supported only on macOS and Windows.".into()),
    }
}

pub fn verify_host(_host: &HostIdentity) -> Result<(), HelperError> {
    Err(unavailable())
}

pub async fn sources(
    _host: &HostIdentity,
    _include_thumbnails: bool,
) -> Result<Vec<Source>, HelperError> {
    Err(unavailable())
}
