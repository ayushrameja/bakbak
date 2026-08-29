use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    App, AppHandle, Emitter, Manager, Runtime, WebviewWindow,
    menu::{Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

pub const TOGGLE_SIDEBAR_EVENT: &str = "window:toggle-sidebar";
pub const WINDOW_APPEARANCE_CHANGED_EVENT: &str = "window:appearance-changed";
const MAIN_WINDOW_LABEL: &str = "main";
const OVERLAY_WINDOW_LABEL: &str = "external-soundboard";
const MAX_EXTERNAL_LINK_LENGTH: usize = 2_048;
#[cfg(any(target_os = "windows", test))]
const WINDOWS_MICA_MIN_BUILD: u32 = 22_621;

#[cfg(target_os = "macos")]
#[derive(Clone, Copy)]
struct MacWindowControlsState {
    visible: bool,
    sidebar_on_right: bool,
}

#[cfg(target_os = "macos")]
static MAC_WINDOW_CONTROLS_STATE: Mutex<MacWindowControlsState> =
    Mutex::new(MacWindowControlsState {
        visible: true,
        sidebar_on_right: false,
    });

pub struct ZoomState(Mutex<f64>);

impl Default for ZoomState {
    fn default() -> Self {
        Self(Mutex::new(1.0))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowAppearance {
    material: &'static str,
    reduced_transparency: bool,
}

#[tauri::command]
pub fn get_desktop_platform(window: WebviewWindow) -> Result<&'static str, String> {
    ensure_startup_window(window.label())?;
    Ok(if cfg!(target_os = "macos") {
        "macos"
    } else {
        "windows"
    })
}

#[tauri::command]
pub fn get_window_appearance(window: WebviewWindow) -> Result<WindowAppearance, String> {
    ensure_startup_window(window.label())?;
    Ok(window_appearance())
}

#[tauri::command]
pub fn set_chrome_scheme(window: WebviewWindow, scheme: &str) -> Result<(), String> {
    ensure_startup_window(window.label())?;
    match scheme {
        "light" | "dark" => Ok(()),
        _ => Err("Invalid window chrome scheme.".to_owned()),
    }
}

#[tauri::command]
pub fn set_window_controls_visible(
    window: WebviewWindow,
    visible: bool,
    sidebar_position: Option<&str>,
) -> Result<(), String> {
    ensure_main_window(window.label())?;
    let sidebar_position = sidebar_position.unwrap_or("left");
    if !matches!(sidebar_position, "left" | "right") {
        return Err("Invalid sidebar position for window controls.".to_owned());
    }

    #[cfg(target_os = "macos")]
    {
        let state = MacWindowControlsState {
            visible,
            sidebar_on_right: sidebar_position == "right",
        };
        *MAC_WINDOW_CONTROLS_STATE
            .lock()
            .map_err(|_| "Window controls state is unavailable.".to_owned())? = state;
        apply_macos_window_controls(&window, state)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, visible, sidebar_position);
    }

    Ok(())
}

#[tauri::command]
pub fn desktop_update_supported(window: WebviewWindow) -> Result<bool, String> {
    ensure_main_window(window.label())?;
    Ok(!cfg!(debug_assertions) && cfg!(target_os = "windows"))
}

#[tauri::command]
pub fn open_external_link(window: WebviewWindow, value: String) -> Result<(), String> {
    ensure_main_window(window.label())?;
    let url = validated_external_link(&value)?;
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|error| error.to_string())
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    install_application_menu(app)?;
    install_tray(app)?;
    apply_window_material(app.handle());
    register_macos_window_controls_reapply(app);
    Ok(())
}

pub fn reveal_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn emit_window_appearance(app: &AppHandle) {
    apply_window_material(app);
    if let Err(error) = app.emit(WINDOW_APPEARANCE_CHANGED_EVENT, window_appearance()) {
        eprintln!("failed to emit window appearance update: {error}");
    }
}

#[cfg(target_os = "macos")]
fn register_macos_window_controls_reapply(app: &App) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let window_for_event = window.clone();
    window.on_window_event(move |event| {
        if !matches!(
            event,
            tauri::WindowEvent::Focused(true) | tauri::WindowEvent::Resized(_)
        ) {
            return;
        }
        let Ok(state) = MAC_WINDOW_CONTROLS_STATE.lock().map(|state| *state) else {
            return;
        };
        let _ = apply_macos_window_controls(&window_for_event, state);
    });
}

#[cfg(not(target_os = "macos"))]
fn register_macos_window_controls_reapply(_app: &App) {}

#[cfg(target_os = "macos")]
fn apply_macos_window_controls(
    window: &WebviewWindow,
    state: MacWindowControlsState,
) -> Result<(), String> {
    let y = if state.sidebar_on_right { 8.0 } else { 16.0 };
    window
        .with_webview(move |webview| {
            use objc2_app_kit::{NSView, NSWindow, NSWindowButton};

            let pointer = webview.ns_window().cast::<NSWindow>();
            if pointer.is_null() {
                return;
            }
            // SAFETY: Tauri supplies the live NSWindow pointer and invokes
            // this callback on the window thread.
            let native_window = unsafe { &*pointer };
            let Some(close) = native_window.standardWindowButton(NSWindowButton::CloseButton)
            else {
                return;
            };
            let Some(minimize) =
                native_window.standardWindowButton(NSWindowButton::MiniaturizeButton)
            else {
                return;
            };
            let Some(zoom) = native_window.standardWindowButton(NSWindowButton::ZoomButton) else {
                return;
            };

            for button in [&close, &minimize, &zoom] {
                button.setHidden(!state.visible);
            }

            // Tauri exposes traffic-light placement only while building a
            // window. Reproduce Tao's placement algorithm here so moving
            // Bakbak's sidebar remains a narrow, native-only command.
            // SAFETY: standard window buttons and their title-bar views
            // belong to this live NSWindow for the duration of the callback.
            let Some(title_bar_container) =
                (unsafe { close.superview() }).and_then(|view| unsafe { view.superview() })
            else {
                return;
            };
            let close_rect = NSView::frame(&close);
            let title_bar_height = close_rect.size.height + y;
            let mut title_bar_rect = NSView::frame(&title_bar_container);
            title_bar_rect.size.height = title_bar_height;
            title_bar_rect.origin.y = native_window.frame().size.height - title_bar_height;
            title_bar_container.setFrame(title_bar_rect);

            let spacing = NSView::frame(&minimize).origin.x - close_rect.origin.x;
            for (index, button) in [close, minimize, zoom].into_iter().enumerate() {
                let mut button_rect = NSView::frame(&button);
                button_rect.origin.x = 16.0 + (index as f64 * spacing);
                button.setFrameOrigin(button_rect.origin);
            }
        })
        .map_err(|error| error.to_string())
}

fn install_application_menu(app: &App) -> tauri::Result<()> {
    let handle = app.handle();
    let toggle_sidebar = MenuItemBuilder::with_id("toggle-sidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+B")
        .build(handle)?;
    let reload = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(handle)?;
    let reset_zoom = MenuItemBuilder::with_id("reset-zoom", "Actual Size")
        .accelerator("CmdOrCtrl+0")
        .build(handle)?;
    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(handle)?;
    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(handle)?;

    let edit_menu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        handle,
        "View",
        true,
        &[
            &toggle_sidebar,
            &PredefinedMenuItem::separator(handle)?,
            &reload,
            &PredefinedMenuItem::separator(handle)?,
            &reset_zoom,
            &zoom_in,
            &zoom_out,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::fullscreen(handle, None)?,
        ],
    )?;
    let window_menu = Submenu::with_items(
        handle,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::maximize(handle, None)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    let mut submenus: Vec<Submenu<_>> = Vec::new();
    #[cfg(target_os = "macos")]
    submenus.push(Submenu::with_items(
        handle,
        "Bakbak",
        true,
        &[
            &PredefinedMenuItem::about(handle, None, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?);
    submenus.extend([edit_menu, view_menu, window_menu]);
    let menu_items = submenus
        .iter()
        .map(|submenu| submenu as &dyn tauri::menu::IsMenuItem<_>)
        .collect::<Vec<_>>();
    app.set_menu(Menu::with_items(handle, &menu_items)?)?;

    app.on_menu_event(|app, event| match event.id().as_ref() {
        "toggle-sidebar" => {
            let _ = app.emit(TOGGLE_SIDEBAR_EVENT, ());
        }
        "reload" => {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                crate::screen_share::stop_for_shutdown(app);
                let _ = window.reload();
            }
        }
        "reset-zoom" => set_zoom(app, 1.0),
        "zoom-in" => adjust_zoom(app, 0.1),
        "zoom-out" => adjust_zoom(app, -0.1),
        _ => {}
    });
    Ok(())
}

fn install_tray(app: &App) -> tauri::Result<()> {
    let handle = app.handle();
    let show = MenuItem::with_id(handle, "tray-show", "Show Bakbak", true, None::<&str>)?;
    let show_soundboard = MenuItem::with_id(
        handle,
        "tray-show-soundboard",
        "Show Soundboard",
        true,
        None::<&str>,
    )?;
    let stop_external = MenuItem::with_id(
        handle,
        "tray-stop-external",
        "Stop External Microphone",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(handle, "tray-quit", "Quit Bakbak", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(handle)?;
    let menu = Menu::with_items(
        handle,
        &[&show, &show_soundboard, &stop_external, &separator, &quit],
    )?;
    let mut builder = TrayIconBuilder::with_id("bakbak")
        .menu(&menu)
        .tooltip("Bakbak")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-show" => reveal_main_window(app),
            "tray-show-soundboard" => crate::external_audio::toggle_overlay(app),
            "tray-stop-external" => crate::external_audio::stop_for_shutdown(app),
            "tray-quit" => {
                crate::external_audio::stop_for_shutdown(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                reveal_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn adjust_zoom(app: &AppHandle, delta: f64) {
    let state = app.state::<ZoomState>();
    if let Ok(mut value) = state.0.lock() {
        *value = (*value + delta).clamp(0.5, 2.0);
        set_webview_zoom(app, *value);
    }
}

fn set_zoom(app: &AppHandle, next: f64) {
    let state = app.state::<ZoomState>();
    if let Ok(mut value) = state.0.lock() {
        *value = next;
        set_webview_zoom(app, next);
    }
}

fn set_webview_zoom(app: &AppHandle, value: f64) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.set_zoom(value);
    }
}

fn ensure_main_window(label: &str) -> Result<(), String> {
    if label == MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err("This shell action is available only in Bakbak's main window.".to_owned())
    }
}

fn ensure_startup_window(label: &str) -> Result<(), String> {
    if matches!(label, MAIN_WINDOW_LABEL | OVERLAY_WINDOW_LABEL) {
        Ok(())
    } else {
        Err("This window cannot access Bakbak's shell state.".to_owned())
    }
}

pub(crate) fn validated_external_link(value: &str) -> Result<url::Url, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_EXTERNAL_LINK_LENGTH {
        return Err("External links must contain between 1 and 2048 characters.".to_owned());
    }
    let url = url::Url::parse(value).map_err(|_| "The external link is invalid.".to_owned())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Only HTTP and HTTPS links can be opened.".to_owned());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("External links cannot contain credentials.".to_owned());
    }
    Ok(url)
}

fn window_appearance() -> WindowAppearance {
    let reduced_transparency = reduced_transparency_requested();
    let material = if reduced_transparency {
        "fallback"
    } else if cfg!(target_os = "macos") {
        "vibrancy"
    } else if windows_mica_supported() {
        "mica"
    } else {
        "fallback"
    };
    WindowAppearance {
        material,
        reduced_transparency,
    }
}

#[cfg(target_os = "macos")]
fn reduced_transparency_requested() -> bool {
    use objc2_app_kit::NSWorkspace;
    NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceTransparency()
}

#[cfg(target_os = "windows")]
fn reduced_transparency_requested() -> bool {
    use windows::UI::ViewManagement::{AccessibilitySettings, UISettings};
    let effects_disabled = UISettings::new()
        .and_then(|settings| settings.AdvancedEffectsEnabled())
        .map(|enabled| !enabled)
        .unwrap_or(false);
    let high_contrast = AccessibilitySettings::new()
        .and_then(|settings| settings.HighContrast())
        .unwrap_or(false);
    effects_disabled || high_contrast
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn reduced_transparency_requested() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn windows_mica_supported() -> bool {
    windows_version::OsVersion::current().build >= WINDOWS_MICA_MIN_BUILD
}

#[cfg(not(target_os = "windows"))]
fn windows_mica_supported() -> bool {
    false
}

fn apply_window_material(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        use tauri::window::{Effect, EffectsBuilder};
        let effects = if window_appearance().material == "mica" {
            EffectsBuilder::new().effect(Effect::Mica).build()
        } else {
            EffectsBuilder::new().build()
        };
        let _ = window.set_effects(effects);
    }

    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[cfg(test)]
mod tests {
    use super::{
        WINDOWS_MICA_MIN_BUILD, ensure_main_window, ensure_startup_window, validated_external_link,
    };

    #[test]
    fn mica_floor_matches_the_supported_windows_shell() {
        assert_eq!(WINDOWS_MICA_MIN_BUILD, 22_621);
    }

    #[test]
    fn shell_commands_authorize_only_the_expected_windows() {
        assert!(ensure_main_window("main").is_ok());
        assert!(ensure_main_window("external-soundboard").is_err());
        assert!(ensure_startup_window("main").is_ok());
        assert!(ensure_startup_window("external-soundboard").is_ok());
        assert!(ensure_startup_window("untrusted").is_err());
    }

    #[test]
    fn external_links_are_bounded_web_urls_without_credentials() {
        assert_eq!(
            validated_external_link("  https://example.com/path?q=1  ")
                .unwrap()
                .as_str(),
            "https://example.com/path?q=1"
        );
        for invalid in [
            "",
            "file:///tmp/private",
            "mailto:friend@example.com",
            "https://friend:secret@example.com/",
            "https://",
        ] {
            assert!(validated_external_link(invalid).is_err(), "{invalid}");
        }
        assert!(
            validated_external_link(&format!("https://example.com/{}", "a".repeat(2049))).is_err()
        );
    }
}
