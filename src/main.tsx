import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import { RuntimeResetRecovery } from "./components/RuntimeResetRecovery";
import {
  applyAppearancePreference,
  loadAppearancePreference,
} from "./features/settings/appearance-preferences";
import {
  getDesktopBridge,
  initializeDesktopRuntime,
  type DesktopWindowAppearance,
} from "./lib/desktop-runtime";
import { prepareDesktopRuntimeGeneration } from "./lib/runtime-generation";
import { ExternalSoundboardOverlay } from "./features/soundboard/ExternalSoundboardOverlay";
import "./styles.css";

function resolvedChromeScheme(): "light" | "dark" {
  const explicit = document.documentElement.dataset.colorScheme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyWindowAppearance(appearance: DesktopWindowAppearance): void {
  document.documentElement.dataset.windowMaterial = appearance.material;
  document.documentElement.dataset.reducedTransparency = String(
    appearance.reducedTransparency,
  );
}

async function renderApp(): Promise<void> {
  const desktopBridge =
    (await initializeDesktopRuntime()) ?? getDesktopBridge();
  const reactRoot = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement,
  );
  const externalOverlay =
    new URLSearchParams(window.location.search).get("window") ===
    "external-soundboard";

  const continueStartup = async (): Promise<void> => {
    if (!externalOverlay) {
      try {
        await prepareDesktopRuntimeGeneration(desktopBridge?.runtime);
      } catch {
        reactRoot.render(
          <React.StrictMode>
            <RuntimeResetRecovery onRetry={continueStartup} />
          </React.StrictMode>,
        );
        return;
      }
    }

    await initializeAppearance(desktopBridge);
    reactRoot.render(
      <React.StrictMode>
        {externalOverlay ? <ExternalSoundboardOverlay /> : <App />}
      </React.StrictMode>,
    );
  };

  await continueStartup();
}

async function initializeAppearance(
  desktopBridge: ReturnType<typeof getDesktopBridge>,
): Promise<void> {
  const appearancePreference = loadAppearancePreference();
  applyAppearancePreference(appearancePreference);
  const desktopWindow = desktopBridge?.window;
  if (desktopWindow) {
    try {
      applyWindowAppearance(await desktopWindow.getAppearance());
    } catch {
      applyWindowAppearance({
        material: "fallback",
        reducedTransparency: false,
      });
    }
    void desktopWindow
      .setChromeScheme(resolvedChromeScheme())
      .catch(() => undefined);
    desktopWindow.onAppearanceChange(applyWindowAppearance);
    window
      .matchMedia("(prefers-color-scheme: light)")
      .addEventListener("change", () => {
        void desktopWindow
          .setChromeScheme(resolvedChromeScheme())
          .catch(() => undefined);
      });
  } else {
    applyWindowAppearance({ material: "fallback", reducedTransparency: false });
  }
}

void renderApp();
