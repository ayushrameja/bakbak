import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import {
  applyAppearancePreference,
  loadAppearancePreference,
} from "./features/settings/appearance-preferences";
import { isDesktopRuntime } from "./lib/desktop-runtime";
import "./styles.css";

function renderApp(): void {
  document.documentElement.dataset.windowMaterial = isDesktopRuntime()
    ? "native"
    : "fallback";
  applyAppearancePreference(loadAppearancePreference());

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

renderApp();
