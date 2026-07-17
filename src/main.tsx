import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/league-gothic/latin-400.css";
import App from "./App";
import { initializeAppearancePreferences } from "./features/settings/appearance-preferences";
import "./styles.css";

const disposeAppearance = initializeAppearancePreferences();
window.addEventListener("beforeunload", disposeAppearance, { once: true });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
