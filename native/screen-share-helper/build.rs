fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    use std::{env, fs, path::PathBuf, process::Command};

    const SWIFT_RUNTIME_CANDIDATES: &[&str] = &[
        "/Library/Developer/CommandLineTools/usr/lib/swift/macosx",
        "/Library/Developer/CommandLineTools/usr/lib/swift-5.5/macosx",
        "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx",
    ];
    for candidate in SWIFT_RUNTIME_CANDIDATES {
        if std::path::Path::new(candidate).is_dir() {
            println!("cargo:rustc-link-search=native={candidate}");
            println!("cargo:rustc-link-arg=-Wl,-rpath,{candidate}");
            break;
        }
    }
    // Production packaging copies the Swift runtime next to Electron's
    // Frameworks. /usr/lib/swift covers modern systems where it is dyld-cached.
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../../Frameworks");
    let webrtc_dir = webrtc_sys_build::webrtc_dir();
    if !webrtc_dir.exists() {
        webrtc_sys_build::download_webrtc()
            .expect("failed to download the pinned LiveKit WebRTC build");
    }
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is required"));
    let archive = webrtc_dir.join("lib/libwebrtc.a");
    let category_dir = out_dir.join("webrtc_objc_categories");
    if category_dir.exists() {
        fs::remove_dir_all(&category_dir).expect("failed to clear WebRTC category objects");
    }
    fs::create_dir_all(&category_dir).expect("failed to create WebRTC category directory");
    const CATEGORY_OBJECTS: &[&str] = &[
        "AVCaptureSession+DevicePosition.o",
        "NSString+StdString.o",
        "RTCEncodedImage+Private.o",
        "RTCPeerConnection+DataChannel.o",
        "RTCPeerConnection+Stats.o",
        "RTCPeerConnectionFactoryBuilder+DefaultComponents.o",
        "RTCVideoCodecInfo+Private.o",
        "RTCVideoEncoderSettings+Private.o",
    ];
    let status = Command::new("ar")
        .arg("-x")
        .arg(&archive)
        .args(CATEGORY_OBJECTS)
        .current_dir(&category_dir)
        .status()
        .expect("failed to extract WebRTC Objective-C categories");
    assert!(
        status.success(),
        "failed to extract WebRTC category objects"
    );
    for object in CATEGORY_OBJECTS {
        let path = category_dir.join(object);
        assert!(path.is_file(), "missing WebRTC category object: {object}");
        println!("cargo:rustc-link-arg={}", path.display());
    }
    println!("cargo:rerun-if-env-changed=LK_CUSTOM_WEBRTC");
    println!("cargo:rerun-if-env-changed=LK_DEBUG_WEBRTC");
}
