import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import {
  applyAppearancePreference,
  loadAppearancePreference,
} from "./features/settings/appearance-preferences";
import "./styles.css";

function renderApp(): void {
  applyAppearancePreference(loadAppearancePreference());

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

renderApp();
