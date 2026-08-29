use tauri::AppHandle;

pub fn register_sleep_observer(app: &AppHandle) -> Result<(), String> {
    register_platform_observer(app)
}

fn suspend_external_audio(app: &AppHandle) {
    crate::external_audio::suspend_for_sleep(app);
}

#[cfg(target_os = "macos")]
fn register_platform_observer(app: &AppHandle) -> Result<(), String> {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2_app_kit::{NSWorkspace, NSWorkspaceWillSleepNotification};
    use objc2_foundation::NSNotification;

    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    let app = app.clone();
    let callback = RcBlock::new(move |_notification: NonNull<NSNotification>| {
        suspend_external_audio(&app);
    });
    // SAFETY: AppKit owns the process-lifetime notification constant and
    // copies the block. The block retains only Tauri's thread-safe AppHandle.
    let observer = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceWillSleepNotification),
            None,
            None,
            &callback,
        )
    };
    Box::leak(Box::new(observer));
    Ok(())
}

#[cfg(target_os = "windows")]
fn register_platform_observer(app: &AppHandle) -> Result<(), String> {
    use std::ffi::c_void;

    use windows::Win32::{
        Foundation::HANDLE,
        System::Power::{
            DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS, PowerRegisterSuspendResumeNotification,
        },
        UI::WindowsAndMessaging::DEVICE_NOTIFY_CALLBACK,
    };

    unsafe extern "system" fn callback(
        context: *const c_void,
        event: u32,
        _setting: *const c_void,
    ) -> u32 {
        use windows::Win32::UI::WindowsAndMessaging::PBT_APMSUSPEND;

        if event == PBT_APMSUSPEND && !context.is_null() {
            // SAFETY: registration stores a leaked AppHandle for process life.
            let app = unsafe { &*(context.cast::<AppHandle>()) };
            suspend_external_audio(app);
        }
        0
    }

    let context = Box::into_raw(Box::new(app.clone()));
    let parameters = Box::into_raw(Box::new(DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS {
        Callback: Some(callback),
        Context: context.cast(),
    }));
    let mut registration = std::ptr::null_mut();
    // SAFETY: with DEVICE_NOTIFY_CALLBACK, Windows interprets recipient as a
    // DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS pointer. Both it and its AppHandle
    // context are retained for the process lifetime on success.
    let result = unsafe {
        PowerRegisterSuspendResumeNotification(
            DEVICE_NOTIFY_CALLBACK,
            HANDLE(parameters.cast()),
            &mut registration,
        )
    };
    if result.0 != 0 {
        // SAFETY: registration failed, so Windows retained neither allocation.
        unsafe {
            drop(Box::from_raw(parameters));
            drop(Box::from_raw(context));
        }
        return Err(format!(
            "Windows could not register the audio sleep observer ({}).",
            result.0
        ));
    }
    let _ = registration;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn register_platform_observer(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}
