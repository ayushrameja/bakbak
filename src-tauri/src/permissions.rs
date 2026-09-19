use serde::Serialize;
use tauri::WebviewWindow;

const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Clone, Copy, Debug)]
pub enum PermissionKind {
    Microphone,
    Screen,
}

impl TryFrom<&str> for PermissionKind {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "microphone" => Ok(Self::Microphone),
            "screen" => Ok(Self::Screen),
            _ => Err("Invalid media permission kind.".to_owned()),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum PermissionStatus {
    NotDetermined,
    // These are stable renderer protocol values even though non-macOS builds
    // currently report Unknown instead of constructing them.
    #[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
    Granted,
    #[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
    Denied,
    #[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
    Restricted,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSnapshot {
    kind: &'static str,
    status: PermissionStatus,
    can_request: bool,
    can_open_settings: bool,
    requires_restart: bool,
}

#[tauri::command]
pub fn get_permission_snapshot(
    window: WebviewWindow,
    kind: &str,
) -> Result<PermissionSnapshot, String> {
    ensure_main_window(window.label())?;
    Ok(snapshot(PermissionKind::try_from(kind)?))
}

#[tauri::command]
pub async fn request_microphone_permission(
    window: WebviewWindow,
) -> Result<PermissionSnapshot, String> {
    ensure_main_window(window.label())?;
    request_microphone().await;
    Ok(snapshot(PermissionKind::Microphone))
}

#[tauri::command]
pub fn open_permission_settings(window: WebviewWindow, kind: &str) -> Result<bool, String> {
    ensure_main_window(window.label())?;
    let kind = PermissionKind::try_from(kind)?;
    let Some(url) = settings_url(kind) else {
        return Ok(false);
    };
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string())?;
    Ok(true)
}

fn ensure_main_window(label: &str) -> Result<(), String> {
    if label == MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err("Media permissions are available only in Bakbak's main window.".to_owned())
    }
}

fn snapshot(kind: PermissionKind) -> PermissionSnapshot {
    let status = permission_status(kind);
    let denied = matches!(
        status,
        PermissionStatus::Denied | PermissionStatus::Restricted
    );
    PermissionSnapshot {
        kind: match kind {
            PermissionKind::Microphone => "microphone",
            PermissionKind::Screen => "screen",
        },
        status,
        can_request: cfg!(target_os = "macos")
            && matches!(kind, PermissionKind::Microphone)
            && status == PermissionStatus::NotDetermined,
        can_open_settings: can_open_settings_for(
            kind,
            status,
            cfg!(target_os = "macos"),
            cfg!(target_os = "windows"),
        ),
        requires_restart: cfg!(target_os = "macos") && denied,
    }
}

fn can_open_settings_for(
    kind: PermissionKind,
    status: PermissionStatus,
    is_macos: bool,
    is_windows: bool,
) -> bool {
    (is_windows && matches!(kind, PermissionKind::Microphone))
        || (is_macos
            && matches!(
                status,
                PermissionStatus::Denied | PermissionStatus::Restricted
            ))
}

#[cfg(target_os = "macos")]
fn permission_status(kind: PermissionKind) -> PermissionStatus {
    match kind {
        PermissionKind::Microphone => macos_microphone_status(),
        PermissionKind::Screen => {
            if core_graphics::access::ScreenCaptureAccess.preflight() {
                PermissionStatus::Granted
            } else {
                PermissionStatus::Denied
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_microphone_status() -> PermissionStatus {
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

    // SAFETY: AVFoundation owns this process-lifetime framework constant.
    let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
        return PermissionStatus::Unknown;
    };
    // SAFETY: AVMediaTypeAudio is the documented media type accepted by this
    // class method and does not outlive the framework-owned static.
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) } {
        AVAuthorizationStatus::NotDetermined => PermissionStatus::NotDetermined,
        AVAuthorizationStatus::Authorized => PermissionStatus::Granted,
        AVAuthorizationStatus::Denied => PermissionStatus::Denied,
        AVAuthorizationStatus::Restricted => PermissionStatus::Restricted,
        _ => PermissionStatus::Unknown,
    }
}

#[cfg(target_os = "macos")]
async fn request_microphone() {
    use std::{sync::mpsc, time::Duration};

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeAudio};

    if macos_microphone_status() != PermissionStatus::NotDetermined {
        return;
    }
    // SAFETY: AVFoundation owns this process-lifetime framework constant.
    let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
        return;
    };
    let (sender, receiver) = mpsc::sync_channel(1);
    {
        let completion = RcBlock::new(move |granted: Bool| {
            let _ = sender.send(granted.as_bool());
        });
        // SAFETY: AVMediaTypeAudio is accepted by the API and AVFoundation
        // copies the completion block before this scope ends.
        unsafe {
            AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &completion)
        };
    }
    let _ = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(Duration::from_secs(60))
    })
    .await;
}

#[cfg(target_os = "windows")]
fn permission_status(_kind: PermissionKind) -> PermissionStatus {
    PermissionStatus::Unknown
}

#[cfg(target_os = "windows")]
async fn request_microphone() {}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn permission_status(_kind: PermissionKind) -> PermissionStatus {
    PermissionStatus::Unknown
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
async fn request_microphone() {}

fn settings_url(kind: PermissionKind) -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    {
        Some(match kind {
            PermissionKind::Microphone => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            }
            PermissionKind::Screen => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
        })
    }

    #[cfg(target_os = "windows")]
    {
        match kind {
            PermissionKind::Microphone => Some("ms-settings:privacy-microphone"),
            PermissionKind::Screen => None,
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = kind;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::{
        PermissionKind, PermissionStatus, can_open_settings_for, ensure_main_window, snapshot,
    };

    #[test]
    fn rejects_unrecognized_permission_kinds() {
        assert!(PermissionKind::try_from("camera").is_err());
    }

    #[test]
    fn permission_commands_are_main_window_only() {
        assert!(ensure_main_window("main").is_ok());
        assert!(ensure_main_window("external-soundboard").is_err());
        assert!(ensure_main_window("untrusted").is_err());
    }

    #[test]
    fn snapshots_keep_renderer_kind_names_stable() {
        assert_eq!(snapshot(PermissionKind::Microphone).kind, "microphone");
        assert_eq!(snapshot(PermissionKind::Screen).kind, "screen");
    }

    #[test]
    fn windows_microphone_recovery_is_actionable_when_status_is_unknown() {
        assert!(can_open_settings_for(
            PermissionKind::Microphone,
            PermissionStatus::Unknown,
            false,
            true,
        ));
        assert!(!can_open_settings_for(
            PermissionKind::Screen,
            PermissionStatus::Unknown,
            false,
            true,
        ));
    }

    #[test]
    fn every_status_serializes_to_the_bridge_contract() {
        let statuses = [
            PermissionStatus::NotDetermined,
            PermissionStatus::Granted,
            PermissionStatus::Denied,
            PermissionStatus::Restricted,
            PermissionStatus::Unknown,
        ];
        let values = statuses
            .into_iter()
            .map(|status| serde_json::to_value(status).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            values,
            [
                "not-determined",
                "granted",
                "denied",
                "restricted",
                "unknown",
            ]
        );
    }
}
