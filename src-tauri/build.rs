fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        use std::{env, fs, path::PathBuf, process::Command};

        println!(
            "cargo:rustc-link-search=native=/Library/Developer/CommandLineTools/usr/lib/swift/macosx"
        );

        let webrtc_dir = webrtc_sys_build::webrtc_dir();
        if !webrtc_dir.exists() {
            webrtc_sys_build::download_webrtc()
                .expect("failed to download the pinned LiveKit WebRTC build");
        }
        let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is required"));
        let webrtc_archive = webrtc_dir.join("lib/libwebrtc.a");
        let category_dir = out_dir.join("webrtc_objc_categories");
        if category_dir.exists() {
            fs::remove_dir_all(&category_dir)
                .expect("failed to clear extracted WebRTC category objects");
        }
        fs::create_dir_all(&category_dir)
            .expect("failed to create WebRTC category extraction directory");
        // A static archive does not pull members that are referenced only
        // through the Objective-C runtime. Keep this reviewed list in sync
        // with the pinned WebRTC archive instead of waiting for each selector
        // to fail at runtime. The broad -ObjC flag is not safe here because it
        // also force-loads unrelated Swift archives and produces duplicate
        // ScreenCaptureKit bridge symbols.
        const WEBRTC_OBJC_CATEGORY_OBJECTS: &[&str] = &[
            "AVCaptureSession+DevicePosition.o",
            "NSString+StdString.o",
            "RTCEncodedImage+Private.o",
            "RTCPeerConnection+DataChannel.o",
            "RTCPeerConnection+Stats.o",
            "RTCPeerConnectionFactoryBuilder+DefaultComponents.o",
            "RTCVideoCodecInfo+Private.o",
            "RTCVideoEncoderSettings+Private.o",
        ];
        let mut command = Command::new("ar");
        command.arg("-x").arg(&webrtc_archive);
        command
            .args(WEBRTC_OBJC_CATEGORY_OBJECTS)
            .current_dir(&category_dir);
        let status = command
            .status()
            .expect("failed to run ar for the pinned WebRTC archive");
        assert!(
            status.success(),
            "failed to extract WebRTC category objects"
        );
        for object in WEBRTC_OBJC_CATEGORY_OBJECTS {
            let category_object = category_dir.join(object);
            assert!(
                category_object.is_file(),
                "WebRTC category object is missing: {object}"
            );
            println!("cargo:rustc-link-arg={}", category_object.display());
        }
        println!("cargo:rerun-if-env-changed=LK_CUSTOM_WEBRTC");
        println!("cargo:rerun-if-env-changed=LK_DEBUG_WEBRTC");
    }
    tauri_build::build()
}
