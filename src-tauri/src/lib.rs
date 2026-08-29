mod external_audio;
mod permissions;
mod power;
mod screen_share;
mod shell;
mod system_accent;
#[cfg(target_os = "windows")]
pub(crate) mod windows_process;

use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("bakbak-navigation")
        .on_navigation(|webview, url| {
            if is_trusted_navigation(url) {
                return true;
            }
            if webview.label() == "main"
                && let Ok(url) = shell::validated_external_link(url.as_str())
            {
                let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build()
}

fn is_trusted_navigation(url: &tauri::Url) -> bool {
    is_current_platform_app_origin(url)
        || (cfg!(debug_assertions) && is_exact_development_origin(url))
}

fn is_current_platform_app_origin(url: &tauri::Url) -> bool {
    #[cfg(target_os = "macos")]
    return is_macos_app_origin(url);
    #[cfg(target_os = "windows")]
    return is_windows_app_origin(url);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    false
}

#[cfg(any(target_os = "macos", test))]
fn is_macos_app_origin(url: &tauri::Url) -> bool {
    url.scheme() == "tauri"
        && url.host_str() == Some("localhost")
        && url.port().is_none()
        && !has_url_credentials(url)
}

#[cfg(any(target_os = "windows", test))]
fn is_windows_app_origin(url: &tauri::Url) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("tauri.localhost")
        && url.port().is_none()
        && !has_url_credentials(url)
}

fn is_exact_development_origin(url: &tauri::Url) -> bool {
    url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"))
        && url.port() == Some(1420)
        && !has_url_credentials(url)
}

fn has_url_credentials(url: &tauri::Url) -> bool {
    !url.username().is_empty() || url.password().is_some()
}

#[cfg(any(target_os = "macos", test))]
fn should_reload_terminated_webview(label: &str) -> bool {
    matches!(label, "main" | "external-soundboard")
}

#[cfg(any(target_os = "macos", test))]
fn should_stop_screen_share_before_renderer_recovery(label: &str) -> bool {
    label == "main"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    {
        builder = builder.on_web_content_process_terminate(|webview| {
            if !should_reload_terminated_webview(webview.label()) {
                return;
            }
            if should_stop_screen_share_before_renderer_recovery(webview.label()) {
                screen_share::stop_for_shutdown(webview.app_handle());
            }
            if webview.reload().is_err() {
                webview.app_handle().request_restart();
            }
        });
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::reveal_main_window(app);
        }));
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.manage(windows_process::WebViewProcessTracker::default());
    }

    builder = builder
        .manage(external_audio::ExternalAudioManager::default())
        .manage(screen_share::ScreenShareManager::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        external_audio::toggle_overlay(app);
                    }
                })
                .build(),
        );

    builder
        .manage(shell::ZoomState::default())
        .plugin(navigation_guard())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename("window-state-v2.json")
                .with_denylist(&["external-soundboard"])
                .build(),
        )
        .setup(|app| {
            shell::setup(app)?;
            external_audio::setup(app.handle());
            power::register_sleep_observer(app.handle())?;
            if let Err(error) = app.global_shortcut().register("CmdOrCtrl+Shift+B") {
                eprintln!("external soundboard shortcut unavailable: {error}");
            }
            if let Err(error) = system_accent::register_system_accent_observer(app.handle()) {
                eprintln!("system accent observer unavailable: {error}");
            }

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |_event| {
                shell::reveal_main_window(&handle);
            });

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                let tracker = app
                    .state::<windows_process::WebViewProcessTracker>()
                    .clone();
                let registration =
                    windows_process::register_webview_process_tracker(&window, tracker.clone());
                screen_share::register_windows_audio_root_monitor(app.handle(), tracker);
                if let Err(error) = registration {
                    eprintln!("Windows webview process proof unavailable: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            permissions::get_permission_snapshot,
            permissions::request_microphone_permission,
            permissions::open_permission_settings,
            screen_share::screen_share_host_identity,
            screen_share::screen_share_capabilities,
            screen_share::screen_share_list_sources,
            screen_share::screen_share_select_source,
            screen_share::screen_share_start,
            screen_share::screen_share_update,
            screen_share::screen_share_stop,
            shell::get_desktop_platform,
            shell::get_window_appearance,
            shell::set_chrome_scheme,
            shell::set_window_controls_visible,
            shell::desktop_update_supported,
            shell::open_external_link,
            external_audio::external_audio_list_devices,
            external_audio::external_audio_get_state,
            external_audio::external_audio_start_setup_test,
            external_audio::external_audio_clear_setup_recording,
            external_audio::external_audio_capture_setup_recording,
            external_audio::external_audio_play_setup_tone,
            external_audio::external_audio_play_setup_recording,
            external_audio::external_audio_stop_setup_test,
            external_audio::external_audio_start,
            external_audio::external_audio_update,
            external_audio::external_audio_play,
            external_audio::external_audio_stop_sound,
            external_audio::external_audio_stop,
            external_audio::external_audio_show_overlay,
            external_audio::external_audio_hide_overlay,
            system_accent::get_system_accent,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "external-soundboard" {
                    api.prevent_close();
                    external_audio::hide_overlay_on_close(window);
                    return;
                }
                if window.label() == "main"
                    && window
                        .app_handle()
                        .state::<external_audio::ExternalAudioManager>()
                        .is_live()
                {
                    api.prevent_close();
                    let manager = window
                        .app_handle()
                        .state::<external_audio::ExternalAudioManager>();
                    if manager.should_explain_close() {
                        let _ = window.emit(external_audio::CLOSE_EXPLANATION_EVENT, ());
                    } else {
                        let _ = window.hide();
                    }
                    return;
                }
                if window.label() == "main" {
                    api.prevent_close();
                    external_audio::stop_for_shutdown(window.app_handle());
                    screen_share::stop_for_shutdown(window.app_handle());
                    window.app_handle().exit(0);
                    return;
                }
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::ThemeChanged(_)) {
                shell::emit_window_appearance(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Bakbak")
        .run(|app, event| match event {
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. } => {
                external_audio::stop_for_shutdown(app);
                screen_share::stop_for_shutdown(app);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{
        is_macos_app_origin, is_trusted_navigation, is_windows_app_origin,
        should_reload_terminated_webview, should_stop_screen_share_before_renderer_recovery,
    };

    #[test]
    fn navigation_is_limited_to_the_bundled_renderer_and_exact_dev_origin() {
        for trusted in ["http://127.0.0.1:1420/", "http://localhost:1420/"] {
            assert!(
                is_trusted_navigation(&trusted.parse().unwrap()),
                "{trusted}"
            );
        }

        for untrusted in [
            "tauri://attacker/index.html",
            "file:///tmp/index.html",
            "https://example.com/",
            "http://localhost:1421/",
            "http://user@localhost:1420/",
        ] {
            assert!(
                !is_trusted_navigation(&untrusted.parse().unwrap()),
                "{untrusted}"
            );
        }
    }

    #[test]
    fn production_navigation_uses_one_exact_platform_origin() {
        assert!(is_macos_app_origin(
            &"tauri://localhost/index.html".parse().unwrap()
        ));
        assert!(!is_macos_app_origin(
            &"http://tauri.localhost/index.html".parse().unwrap()
        ));
        assert!(!is_macos_app_origin(
            &"tauri://localhost:3000/index.html".parse().unwrap()
        ));
        assert!(!is_macos_app_origin(
            &"tauri://user@localhost/index.html".parse().unwrap()
        ));

        assert!(is_windows_app_origin(
            &"http://tauri.localhost/index.html".parse().unwrap()
        ));
        assert!(!is_windows_app_origin(
            &"tauri://localhost/index.html".parse().unwrap()
        ));
        assert!(!is_windows_app_origin(
            &"http://tauri.localhost:3000/index.html".parse().unwrap()
        ));
        assert!(!is_windows_app_origin(
            &"http://user@tauri.localhost/index.html".parse().unwrap()
        ));
    }

    #[test]
    fn web_content_recovery_is_limited_to_bakbaks_trusted_webviews() {
        assert!(should_reload_terminated_webview("main"));
        assert!(should_reload_terminated_webview("external-soundboard"));
        assert!(!should_reload_terminated_webview("attacker"));
        assert!(!should_reload_terminated_webview(""));
    }

    #[test]
    fn only_main_renderer_recovery_stops_an_active_screen_share() {
        assert!(should_stop_screen_share_before_renderer_recovery("main"));
        assert!(!should_stop_screen_share_before_renderer_recovery(
            "external-soundboard"
        ));
        assert!(!should_stop_screen_share_before_renderer_recovery(
            "attacker"
        ));
        assert!(!should_stop_screen_share_before_renderer_recovery(""));
    }
}
