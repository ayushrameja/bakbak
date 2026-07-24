import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  applyAppearancePreference,
  loadAppearancePreference,
} from "./features/settings/appearance-preferences";
import { initializeSystemAccent } from "./features/settings/system-accent";
import "./styles.css";

async function renderApp(): Promise<void> {
  applyAppearancePreference(loadAppearancePreference());
  await initializeSystemAccent(250);

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void renderApp();
