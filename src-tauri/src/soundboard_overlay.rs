//! Native ownership of hold/release, dismissal and exactly-once selection.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const WINDOW: &str = "external-soundboard";
const EVENT: &str = "external-audio:overlay-interaction";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Open,
    Released,
    #[default]
    Closed,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Hold,
    #[default]
    Browse,
}
#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Interaction {
    id: u64,
    phase: Phase,
    mode: Mode,
}
#[derive(Default)]
pub struct OverlayState(Mutex<Controller>);
#[derive(Default)]
struct Controller {
    interaction: Interaction,
    key_down: bool,
    previous_app: Option<usize>,
}
impl Controller {
    fn open(&mut self, mode: Mode) {
        self.interaction = Interaction {
            id: self.interaction.id + 1,
            phase: Phase::Open,
            mode,
        };
    }
    fn press(&mut self) -> bool {
        if self.key_down {
            return false;
        }
        self.key_down = true;
        self.open(Mode::Hold);
        true
    }
    fn release(&mut self) -> bool {
        self.key_down = false;
        if self.interaction.mode != Mode::Hold || self.interaction.phase != Phase::Open {
            return false;
        }
        self.interaction.phase = Phase::Released;
        true
    }
    fn finish(&mut self, id: u64) -> bool {
        if self.interaction.id != id || self.interaction.phase == Phase::Closed {
            return false;
        }
        self.interaction.phase = Phase::Closed;
        true
    }
}
fn emit(app: &AppHandle, interaction: Interaction) {
    let _ = app.emit_to(WINDOW, EVENT, interaction);
}
fn hide(app: &AppHandle, restore: bool) {
    let target = app
        .state::<OverlayState>()
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .previous_app
        .take();
    if let Some(window) = app.get_webview_window(WINDOW) {
        let was_focused = window.is_focused().unwrap_or(false);
        let _ = window.hide();
        if restore
            && was_focused
            && let Some(target) = target
        {
            restore_app(target);
        }
    }
}

#[cfg(target_os = "macos")]
fn foreground_app() -> Option<usize> {
    objc2_app_kit::NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|app| app.processIdentifier() as usize)
        .filter(|pid| *pid != std::process::id() as usize)
}
#[cfg(target_os = "macos")]
fn restore_app(pid: usize) {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
    if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid as i32) {
        // Supported back to our macOS 12.3 minimum. New activation APIs require
        // newer macOS; this restores only the app that owned focus on opening.
        #[allow(deprecated)]
        let _ = app.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    }
}
#[cfg(target_os = "windows")]
fn foreground_app() -> Option<usize> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    // SAFETY: the OS owns these window handles; neither call dereferences app memory.
    unsafe {
        let window = GetForegroundWindow();
        let mut pid = 0;
        GetWindowThreadProcessId(window, Some(&mut pid));
        (!window.is_invalid() && pid != std::process::id()).then_some(window.0 as usize)
    }
}
#[cfg(target_os = "windows")]
fn restore_app(window: usize) {
    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{IsWindow, SetForegroundWindow},
    };
    let window = HWND(window as *mut std::ffi::c_void);
    // SAFETY: validate the OS handle and let Windows enforce foreground rules.
    unsafe {
        if IsWindow(Some(window)).as_bool() {
            let _ = SetForegroundWindow(window);
        }
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn foreground_app() -> Option<usize> {
    None
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn restore_app(_target: usize) {}

pub fn shortcut(app: &AppHandle, pressed: bool) {
    let state = app.state::<OverlayState>();
    let mut controller = state
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if pressed {
        if !controller.press() {
            return;
        }
        controller.previous_app = foreground_app().or(controller.previous_app);
        let interaction = controller.interaction;
        drop(controller);
        if crate::external_audio::show_overlay_window(app).is_err() {
            cancel(app);
            return;
        }
        emit(app, interaction);
    } else {
        if !controller.release() {
            return;
        }
        let interaction = controller.interaction;
        drop(controller);
        // Hide natively even if the renderer is loading/unresponsive. The hidden
        // webview can then commit the selection without trapping the game input.
        emit(app, interaction);
        hide(app, true);
    }
}

pub fn browse(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<OverlayState>();
    let interaction = {
        let mut controller = state
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        controller.previous_app = foreground_app().or(controller.previous_app);
        controller.open(Mode::Browse);
        controller.interaction
    };
    if let Err(error) = crate::external_audio::show_overlay_window(app) {
        cancel(app);
        return Err(error);
    }
    emit(app, interaction);
    Ok(())
}

pub fn cancel(app: &AppHandle) {
    let state = app.state::<OverlayState>();
    let interaction = {
        let mut controller = state
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        controller.interaction.phase = Phase::Closed;
        controller.interaction
    };
    emit(app, interaction);
    hide(app, true);
}

pub fn lost_focus(app: &AppHandle) {
    if app
        .get_webview_window(WINDOW)
        .is_some_and(|window| window.is_focused().unwrap_or(false))
    {
        return; // A queued loss from an earlier hide must not cancel a new hold.
    }
    let state = app.state::<OverlayState>();
    let mut controller = state
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    // The native hide on release also loses focus: it must not cancel a valid
    // release. Only a still-open wheel is cancelled by switching to another app.
    if controller.interaction.phase != Phase::Open {
        return;
    }
    controller.interaction.phase = Phase::Closed;
    let interaction = controller.interaction;
    drop(controller);
    emit(app, interaction);
    hide(app, false);
}

fn ensure_overlay(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == WINDOW {
        Ok(())
    } else {
        Err("Only the sound wheel can finish its interaction.".into())
    }
}
#[tauri::command]
pub fn external_overlay_get_interaction(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Interaction, String> {
    ensure_overlay(&window)?;
    Ok(app
        .state::<OverlayState>()
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .interaction)
}
#[tauri::command]
pub fn external_overlay_finish(
    app: AppHandle,
    window: WebviewWindow,
    id: u64,
    play: bool,
) -> Result<bool, String> {
    ensure_overlay(&window)?;
    let state = app.state::<OverlayState>();
    let mut controller = state
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if !controller.finish(id) {
        return Ok(false);
    }
    let interaction = controller.interaction;
    drop(controller);
    emit(&app, interaction);
    hide(&app, true);
    Ok(play
        && app
            .state::<crate::external_audio::ExternalAudioManager>()
            .is_live())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hold_repeat_click_release_plays_only_once() {
        let mut state = Controller::default();
        assert!(state.press());
        let id = state.interaction.id;
        assert!(!state.press());
        assert!(state.finish(id));
        assert!(!state.press()); // auto-repeat after click must not reopen
        assert!(!state.release());
        assert!(!state.finish(id));
        assert!(state.press());
        assert!(state.release());
        assert!(state.finish(state.interaction.id));
    }
    #[test]
    fn stale_finishes_and_browse_release_do_not_dismiss_new_wheel() {
        let mut state = Controller::default();
        state.press();
        let old = state.interaction.id;
        state.release();
        state.press();
        assert!(!state.finish(old));
        assert_eq!(state.interaction.phase, Phase::Open);
        state.release();
        state.open(Mode::Browse);
        assert!(!state.release());
        assert_eq!(state.interaction.phase, Phase::Open);
    }
    #[test]
    fn cancel_then_release_never_commits() {
        let mut state = Controller::default();
        state.press();
        state.interaction.phase = Phase::Closed;
        assert!(!state.release());
        assert!(!state.finish(state.interaction.id));
    }
}
