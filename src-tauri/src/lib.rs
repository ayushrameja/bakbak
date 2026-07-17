mod screen_share;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(screen_share::ScreenShareManager::default())
        .invoke_handler(tauri::generate_handler![
            screen_share::get_screen_share_capabilities,
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
