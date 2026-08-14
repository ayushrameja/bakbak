import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import {
  applyAppearancePreference,
  loadAppearancePreference,
} from "./features/settings/appearance-preferences";
import {
  getDesktopBridge,
  type DesktopWindowAppearance,
} from "./lib/desktop-runtime";
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
  const appearancePreference = loadAppearancePreference();
  applyAppearancePreference(appearancePreference);
  const desktopWindow = getDesktopBridge()?.window;
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

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void renderApp();
