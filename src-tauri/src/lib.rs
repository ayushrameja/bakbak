mod screen_share;

use tauri::Manager;

#[cfg(target_os = "windows")]
use tauri::window::{Effect, EffectsBuilder};

fn native_window_material_supported() -> bool {
    #[cfg(target_os = "macos")]
    {
        true
    }

    #[cfg(target_os = "windows")]
    {
        windows_version::OsVersion::current().build >= 22_000
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let window_material = if native_window_material_supported() {
        "native"
    } else {
        "fallback"
    };
    let material_initialization_script =
        format!("document.documentElement.dataset.windowMaterial = '{window_material}';");

    tauri::Builder::default()
        .append_invoke_initialization_script(material_initialization_script)
        .manage(screen_share::ScreenShareManager::default())
        .setup(|_app| {
            #[cfg(target_os = "windows")]
            if native_window_material_supported() {
                if let Some(window) = _app.get_webview_window("main") {
                    window.set_effects(EffectsBuilder::new().effect(Effect::Mica).build())?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            screen_share::get_screen_share_capabilities,
            screen_share::open_screen_recording_settings,
            screen_share::list_screen_share_sources,
            screen_share::start_screen_share,
            screen_share::stop_screen_share,
            screen_share::update_screen_share_settings
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    screen_share::stop_active_share_for_shutdown(app).await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Bakbak");
}
