import React from "react";
import ReactDOM from "react-dom/client";
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
