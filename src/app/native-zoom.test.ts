import { describe, expect, it } from "vitest";
import capabilities from "../../src-tauri/capabilities/default.json";
import tauriConfig from "../../src-tauri/tauri.conf.json";

describe("native interface zoom", () => {
  it("enables desktop zoom hotkeys for the main window", () => {
    const mainWindow = tauriConfig.app.windows.find(
      (window) => window.label === "main",
    );

    expect(mainWindow?.zoomHotkeysEnabled).toBe(true);
    expect(capabilities.permissions).toContain(
      "core:webview:allow-set-webview-zoom",
    );
  });
});
