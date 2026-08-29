use serde::Serialize;
use tauri::{AppHandle, Emitter, WebviewWindow};

pub const SYSTEM_ACCENT_CHANGED_EVENT: &str = "system-accent:changed";
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAccent {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
    pub source: &'static str,
}

impl SystemAccent {
    const fn fallback() -> Self {
        Self {
            red: 128,
            green: 128,
            blue: 128,
            source: "fallback",
        }
    }
}

#[tauri::command]
pub fn get_system_accent(window: WebviewWindow) -> Result<SystemAccent, String> {
    ensure_main_window(window.label())?;
    Ok(current_system_accent())
}

fn current_system_accent() -> SystemAccent {
    read_system_accent().unwrap_or_else(|error| {
        eprintln!("system accent unavailable: {error}");
        SystemAccent::fallback()
    })
}

pub fn register_system_accent_observer(app: &AppHandle) -> Result<(), String> {
    register_platform_observer(app)
}

fn emit_current_appearance(app: &AppHandle) {
    if let Err(error) = app.emit(SYSTEM_ACCENT_CHANGED_EVENT, current_system_accent()) {
        eprintln!("failed to emit system accent update: {error}");
    }
    crate::shell::emit_window_appearance(app);
}

fn ensure_main_window(label: &str) -> Result<(), String> {
    if label == MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err("System appearance is available only in Bakbak's main window.".to_owned())
    }
}

#[cfg(target_os = "macos")]
fn read_system_accent() -> Result<SystemAccent, String> {
    use objc2_app_kit::{NSColor, NSColorSpace};

    let accent = NSColor::controlAccentColor();
    let srgb = accent
        .colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())
        .ok_or_else(|| "AppKit could not convert the accent to sRGB".to_owned())?;

    Ok(SystemAccent {
        red: normalized_component_to_u8(srgb.redComponent()),
        green: normalized_component_to_u8(srgb.greenComponent()),
        blue: normalized_component_to_u8(srgb.blueComponent()),
        source: "macos",
    })
}

#[cfg(target_os = "macos")]
fn normalized_component_to_u8(component: f64) -> u8 {
    (component.clamp(0.0, 1.0) * 255.0).round() as u8
}

#[cfg(target_os = "macos")]
fn register_platform_observer(app: &AppHandle) -> Result<(), String> {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2_app_kit::{
        NSSystemColorsDidChangeNotification,
        NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification,
    };
    use objc2_foundation::{NSNotification, NSNotificationCenter};

    let center = NSNotificationCenter::defaultCenter();
    // SAFETY: AppKit owns these process-lifetime framework constants.
    let notification_names = unsafe {
        [
            NSSystemColorsDidChangeNotification,
            NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification,
        ]
    };
    for notification_name in notification_names {
        let app = app.clone();
        let callback = RcBlock::new(move |_notification: NonNull<NSNotification>| {
            emit_current_appearance(&app);
        });
        // SAFETY: AppKit owns both notification names and the copied block
        // retains only a thread-safe AppHandle for the process lifetime.
        let observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(notification_name),
                None,
                None,
                &callback,
            )
        };
        Box::leak(Box::new(observer));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn read_system_accent() -> Result<SystemAccent, String> {
    use windows::UI::ViewManagement::{UIColorType, UISettings};

    let settings = UISettings::new().map_err(|error| error.to_string())?;
    let color = settings
        .GetColorValue(UIColorType::Accent)
        .map_err(|error| error.to_string())?;

    Ok(SystemAccent {
        red: color.R,
        green: color.G,
        blue: color.B,
        source: "windows",
    })
}

#[cfg(target_os = "windows")]
fn register_platform_observer(app: &AppHandle) -> Result<(), String> {
    use windows::{
        Foundation::TypedEventHandler,
        UI::ViewManagement::{AccessibilitySettings, UISettings},
        core::IInspectable,
    };

    let settings = UISettings::new().map_err(|error| error.to_string())?;
    let app_for_colors = app.clone();
    let color_handler =
        TypedEventHandler::<UISettings, IInspectable>::new(move |_sender, _event_args| {
            emit_current_appearance(&app_for_colors);
            Ok(())
        });
    let color_token = settings
        .ColorValuesChanged(&color_handler)
        .map_err(|error| error.to_string())?;

    let app_for_effects = app.clone();
    let effects_handler =
        TypedEventHandler::<UISettings, IInspectable>::new(move |_sender, _event_args| {
            emit_current_appearance(&app_for_effects);
            Ok(())
        });
    let effects_token = settings
        .AdvancedEffectsEnabledChanged(&effects_handler)
        .map_err(|error| error.to_string())?;

    let accessibility = AccessibilitySettings::new().map_err(|error| error.to_string())?;
    let app_for_contrast = app.clone();
    let contrast_handler = TypedEventHandler::<AccessibilitySettings, IInspectable>::new(
        move |_sender, _event_args| {
            emit_current_appearance(&app_for_contrast);
            Ok(())
        },
    );
    let contrast_token = accessibility
        .HighContrastChanged(&contrast_handler)
        .map_err(|error| error.to_string())?;

    Box::leak(Box::new((
        settings,
        color_handler,
        color_token,
        effects_handler,
        effects_token,
        accessibility,
        contrast_handler,
        contrast_token,
    )));
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_system_accent() -> Result<SystemAccent, String> {
    Err("this platform does not expose a supported native accent API".to_owned())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn register_platform_observer(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{SystemAccent, ensure_main_window};

    #[test]
    fn neutral_fallback_is_stable_and_explicit() {
        assert_eq!(
            SystemAccent::fallback(),
            SystemAccent {
                red: 128,
                green: 128,
                blue: 128,
                source: "fallback",
            }
        );
    }

    #[test]
    fn system_accent_command_is_main_window_only() {
        assert!(ensure_main_window("main").is_ok());
        assert!(ensure_main_window("external-soundboard").is_err());
        assert!(ensure_main_window("untrusted").is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn normalized_components_are_clamped_and_rounded() {
        use super::normalized_component_to_u8;

        assert_eq!(normalized_component_to_u8(-0.1), 0);
        assert_eq!(normalized_component_to_u8(0.5), 128);
        assert_eq!(normalized_component_to_u8(1.1), 255);
    }
}
