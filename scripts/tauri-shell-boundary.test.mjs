import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const url = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        directory,
      );
      if (entry.isDirectory()) return sourceFiles(url);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [url] : [];
    }),
  );
  return nested.flat();
}

test("only the Tauri desktop adapter imports renderer-side Tauri APIs", async () => {
  const adapter = new URL("src/lib/tauri-desktop-runtime.ts", root).href;
  const files = await sourceFiles(new URL("src/", root));

  for (const file of files) {
    if (file.href === adapter) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /@tauri-apps\//,
      `${file.pathname} bypasses the typed desktop adapter`,
    );
    assert.doesNotMatch(
      source,
      /(?:window|globalThis)\s*\.\s*__TAURI__\b/,
      `${file.pathname} accesses the raw Tauri global`,
    );
  }
});

test("Tauri shell is additive while Electron remains a buildable fallback", async () => {
  const [
    packageMetadata,
    electronPreload,
    tauriAdapter,
    tauriManifest,
    tauriLib,
    tauriShell,
    screenShare,
    windowsProcess,
    externalAudio,
  ] = await Promise.all([
    readFile(new URL("package.json", root), "utf8").then(JSON.parse),
    readFile(new URL("electron/preload.cts", root), "utf8"),
    readFile(new URL("src/lib/tauri-desktop-runtime.ts", root), "utf8"),
    readFile(new URL("src-tauri/Cargo.toml", root), "utf8"),
    readFile(new URL("src-tauri/src/lib.rs", root), "utf8"),
    readFile(new URL("src-tauri/src/shell.rs", root), "utf8"),
    readFile(new URL("src-tauri/src/screen_share.rs", root), "utf8"),
    readFile(new URL("src-tauri/src/windows_process.rs", root), "utf8"),
    readFile(new URL("src-tauri/src/external_audio.rs", root), "utf8"),
  ]);

  assert.equal(packageMetadata.main, "electron-dist/main.js");
  assert.equal(
    packageMetadata.scripts["desktop:build"].includes("electron-builder"),
    true,
  );
  assert.match(packageMetadata.scripts["tauri:build"], /\btauri build\b/);
  assert.match(
    packageMetadata.scripts["tauri:build"],
    /src-tauri\/tauri\.sidecar\.conf\.json/,
  );
  assert.match(
    packageMetadata.scripts["tauri:build:local"],
    /src-tauri\/tauri\.local\.conf\.json/,
  );
  assert.equal(
    packageMetadata.dependencies["@tauri-apps/api"].startsWith("^2."),
    true,
  );
  assert.equal(
    packageMetadata.dependencies["@tauri-apps/plugin-opener"],
    undefined,
  );
  assert.match(
    electronPreload,
    /runtime:\s*Object\.freeze\(\{ shell: "electron", generation: 1 \}\)/,
  );
  assert.match(electronPreload, /process\.platform === "darwin" \? "manual"/);
  assert.doesNotMatch(tauriAdapter, /@tauri-apps\/plugin-opener/);
  assert.match(tauriAdapter, /invoke<void>\("open_external_link"/);
  assert.match(tauriManifest, /features = \["deep-link"\]/);
  assert.doesNotMatch(tauriAdapter, /deep-link:second-instance/);
  assert.doesNotMatch(tauriLib, /SECOND_INSTANCE_DEEP_LINK_EVENT/);
  assert.match(tauriLib, /on_web_content_process_terminate/);
  const macRecovery = tauriLib.slice(
    tauriLib.indexOf("on_web_content_process_terminate"),
    tauriLib.indexOf(
      "tauri_plugin_single_instance",
      tauriLib.indexOf("on_web_content_process_terminate"),
    ),
  );
  const macScreenStop = macRecovery.indexOf("screen_share::stop_for_shutdown");
  const macReload = macRecovery.indexOf("webview.reload()");
  assert.ok(
    macScreenStop >= 0,
    "main macOS renderer recovery must stop native screen sharing",
  );
  assert.ok(
    macScreenStop < macReload,
    "macOS must stop native screen sharing before reloading the main renderer",
  );
  assert.match(
    macRecovery,
    /should_stop_screen_share_before_renderer_recovery\(webview\.label\(\)\)/,
  );
  assert.match(
    tauriLib,
    /fn should_stop_screen_share_before_renderer_recovery\(label: &str\) -> bool \{\s*label == "main"\s*\}/,
  );
  assert.match(
    macRecovery,
    /if webview\.reload\(\)\.is_err\(\) \{\s*webview\.app_handle\(\)\.request_restart\(\)/,
  );

  const menuReload = tauriShell.slice(
    tauriShell.indexOf('"reload" =>'),
    tauriShell.indexOf('"reset-zoom"', tauriShell.indexOf('"reload" =>')),
  );
  const menuScreenStop = menuReload.indexOf("screen_share::stop_for_shutdown");
  const rendererReload = menuReload.indexOf("window.reload()");
  assert.ok(menuScreenStop >= 0, "menu reload must stop native screen sharing");
  assert.ok(
    menuScreenStop < rendererReload,
    "menu reload must stop native screen sharing before reloading the renderer",
  );
  assert.match(tauriLib, /screen_share::screen_share_host_identity/);
  assert.doesNotMatch(tauriLib, /screen_share_disable_audio/);
  assert.match(screenShare, /HelperCommand::DisableAudio/);
  assert.match(
    screenShare,
    /HelperResponseResult::ProtocolViolation => return Err\(\(\)\)/,
  );
  assert.match(windowsProcess, /add_ProcessFailed/);
  assert.match(windowsProcess, /app_for_failure\.request_restart\(\)/);
  assert.match(windowsProcess, /webview\.Reload\(\)/);
  const windowsFailureRecovery = windowsProcess.slice(
    windowsProcess.indexOf("let handler = ProcessFailedEventHandler"),
    windowsProcess.indexOf("add_ProcessFailed"),
  );
  const windowsScreenStop = windowsFailureRecovery.indexOf(
    "screen_share::stop_for_shutdown",
  );
  const windowsReload = windowsFailureRecovery.indexOf("webview.Reload()");
  const windowsRestart = windowsFailureRecovery.indexOf(
    "app_for_failure.request_restart()",
  );
  assert.match(
    windowsFailureRecovery,
    /failure_action_requires_screen_share_stop\(action\)/,
  );
  assert.ok(
    windowsScreenStop >= 0 &&
      windowsScreenStop < windowsReload &&
      windowsScreenStop < windowsRestart,
    "Windows must stop native screen sharing before renderer reload or restart",
  );
  assert.match(
    windowsProcess,
    /COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED\s*\| COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED\s*\| COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,[\s\S]*?=> WebViewFailureAction::Reload/,
  );
  assert.match(
    windowsProcess,
    /COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED\s*\| COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,[\s\S]*?\| None => WebViewFailureAction::Restart/,
  );
  assert.doesNotMatch(
    windowsProcess,
    /ProcessDescription|ExitCode|FailureSourceModulePath|eprintln!|println!/,
  );

  const processFailedHook = windowsProcess.indexOf("add_ProcessFailed");
  const processInfosHook = windowsProcess.indexOf("add_ProcessInfosChanged");
  const hooksReady = windowsProcess.indexOf(
    "hooks_ready_in_webview.store(true, Ordering::Release)",
  );
  const initialProof = windowsProcess.indexOf("tracker.refresh(", hooksReady);
  assert.ok(processFailedHook >= 0, "ProcessFailed must be registered");
  assert.ok(
    processFailedHook < processInfosHook,
    "crash recovery must be registered before process proof observation",
  );
  assert.ok(
    processInfosHook < hooksReady,
    "process proof must stay unavailable until both hooks are installed",
  );
  assert.ok(
    hooksReady < initialProof,
    "initial process proof must only publish after both hooks are installed",
  );
  assert.match(
    windowsProcess,
    /if !hooks_ready_for_event\.load\(Ordering::Acquire\)/,
  );

  const trackerRegistration = tauriLib.indexOf(
    "windows_process::register_webview_process_tracker",
  );
  const rootMonitorRegistration = tauriLib.indexOf(
    "screen_share::register_windows_audio_root_monitor",
    trackerRegistration,
  );
  const registrationErrorHandling = tauriLib.indexOf(
    "if let Err(error) = registration",
    rootMonitorRegistration,
  );
  assert.ok(
    trackerRegistration < rootMonitorRegistration &&
      rootMonitorRegistration < registrationErrorHandling,
    "audio-root monitoring must start even when recovery-hook registration fails",
  );

  const trustedToggle = externalAudio.slice(
    externalAudio.indexOf("pub fn toggle_overlay"),
    externalAudio.indexOf("fn overlay_toggle_action"),
  );
  const rendererShow = externalAudio.slice(
    externalAudio.indexOf("pub fn external_audio_show_overlay"),
    externalAudio.indexOf("pub fn external_audio_hide_overlay"),
  );
  assert.match(trustedToggle, /show_overlay_window\(app\)/);
  assert.doesNotMatch(trustedToggle, /is_live|reveal_main_window/);
  assert.match(rendererShow, /if !manager\.is_live\(\)/);
});

test("Tauri config preserves identity, updater trust, deep links, and narrow capabilities", async () => {
  const [
    config,
    macConfig,
    windowsConfig,
    localConfig,
    capability,
    overlayCapability,
    updaterCapability,
  ] = await Promise.all([
    readFile(new URL("src-tauri/tauri.conf.json", root), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("src-tauri/tauri.macos.conf.json", root), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("src-tauri/tauri.windows.conf.json", root), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("src-tauri/tauri.local.conf.json", root), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("src-tauri/capabilities/default.json", root), "utf8").then(
      JSON.parse,
    ),
    readFile(
      new URL("src-tauri/capabilities/external-soundboard.json", root),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("src-tauri/capabilities/windows-updater.json", root),
      "utf8",
    ).then(JSON.parse),
  ]);

  assert.equal(config.identifier, "com.bakbak.desktop");
  assert.equal(config.plugins["deep-link"].desktop.schemes[0], "bakbak");
  assert.match(config.plugins.updater.endpoints[0], /latest\.json$/);
  assert.ok(config.plugins.updater.pubkey.length > 40);
  assert.equal(config.bundle.createUpdaterArtifacts, false);
  assert.equal(macConfig.bundle.createUpdaterArtifacts, false);
  assert.deepEqual(macConfig.bundle.targets, ["dmg"]);
  assert.equal(windowsConfig.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(localConfig.bundle.externalBin, [
    "binaries/bakbak-screen-share-helper",
  ]);
  assert.deepEqual(capability.windows, ["main"]);
  assert.equal(capability.permissions.includes("core:default"), false);
  assert.equal(capability.permissions.includes("shell:allow-execute"), false);
  assert.equal(capability.permissions.includes("updater:default"), false);
  assert.equal(
    capability.permissions.some((permission) =>
      typeof permission === "string"
        ? permission.startsWith("opener:")
        : permission.identifier.startsWith("opener:"),
    ),
    false,
  );
  assert.deepEqual(overlayCapability.windows, ["external-soundboard"]);
  assert.deepEqual(overlayCapability.permissions, [
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-start-dragging",
  ]);
  assert.deepEqual(updaterCapability.platforms, ["windows"]);
  assert.deepEqual(updaterCapability.windows, ["main"]);
  assert.equal(updaterCapability.permissions.includes("updater:default"), true);
});

test("Tauri package version starts synchronized with the renderer", async () => {
  const [packageMetadata, config, manifest] = await Promise.all([
    readFile(new URL("package.json", root), "utf8").then(JSON.parse),
    readFile(new URL("src-tauri/tauri.conf.json", root), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("src-tauri/Cargo.toml", root), "utf8"),
  ]);
  const cargoVersion = /^version = "([^"]+)"$/m.exec(manifest)?.[1];

  assert.equal(config.version, packageMetadata.version);
  assert.equal(cargoVersion, packageMetadata.version);
});
