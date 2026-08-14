import { useState } from "react";
import type { AppSpace } from "../server/app-space";
import { SidebarGradientPicker } from "./SidebarGradientPicker";
import {
  resetSpaceSidebarTheme,
  MAX_CHROME_THEME_TRANSPARENCY,
  MIN_CHROME_THEME_TRANSPARENCY,
  type SidebarThemeMode,
  type SidebarThemePreferences,
  type SidebarThemeTexture,
  type SpaceSidebarTheme,
} from "./sidebar-theme-preferences";

interface SidebarThemeEditorProps {
  value: SidebarThemePreferences;
  onChange: (preferences: SidebarThemePreferences) => void;
  initialSpace?: AppSpace;
}

const SPACE_LABELS: Record<AppSpace, string> = {
  server: "Bakbak",
  personal: "Personal",
};

const TEXTURES: { value: SidebarThemeTexture; label: string }[] = [
  { value: "none", label: "None" },
  { value: "dots", label: "Dots" },
  { value: "grain", label: "Grain" },
];

export function SidebarThemeEditor({
  value,
  onChange,
  initialSpace = "server",
}: SidebarThemeEditorProps) {
  const [activeSpace, setActiveSpace] = useState<AppSpace>(initialSpace);
  const theme = value.spaces[activeSpace];

  function updateTheme(next: SpaceSidebarTheme) {
    onChange({
      ...value,
      spaces: { ...value.spaces, [activeSpace]: next },
    });
  }

  function updateMode(mode: SidebarThemeMode) {
    updateTheme({ ...theme, mode });
  }

  return (
    <div className="sidebar-theme-editor">
      <div
        className="sidebar-theme-editor__spaces"
        role="group"
        aria-label="Chrome space"
      >
        {(["server", "personal"] as const).map((space) => (
          <button
            type="button"
            className={space === activeSpace ? "is-active" : ""}
            aria-pressed={space === activeSpace}
            onClick={() => setActiveSpace(space)}
            key={space}
          >
            {SPACE_LABELS[space]}
          </button>
        ))}
      </div>

      {theme.mode === "glass" ? (
        <div
          className="sidebar-theme-editor__glass-preview"
          role="img"
          aria-label={`${SPACE_LABELS[activeSpace]} liquid glass preview`}
        >
          <span>
            <strong>Liquid glass</strong>
            <small>Always transparent. Tune the level below.</small>
          </span>
        </div>
      ) : (
        <SidebarGradientPicker
          label={SPACE_LABELS[activeSpace]}
          theme={theme}
          onChange={updateTheme}
        />
      )}

      <div className="sidebar-theme-editor__controls">
        <fieldset className="sidebar-theme-field">
          <legend>Chrome appearance</legend>
          <div className="sidebar-theme-segmented">
            <button
              type="button"
              className={theme.mode === "glass" ? "is-selected" : ""}
              aria-pressed={theme.mode === "glass"}
              onClick={() => updateMode("glass")}
            >
              Glass
            </button>
            <button
              type="button"
              className={theme.mode === "gradient" ? "is-selected" : ""}
              aria-pressed={theme.mode === "gradient"}
              onClick={() => updateMode("gradient")}
            >
              Gradient
            </button>
          </div>
        </fieldset>

        <label className="sidebar-theme-range">
          <span>
            <strong>Transparency</strong>
            <small>{theme.transparency}%</small>
          </span>
          <input
            type="range"
            min={MIN_CHROME_THEME_TRANSPARENCY}
            max={MAX_CHROME_THEME_TRANSPARENCY}
            value={theme.transparency}
            aria-label={`${SPACE_LABELS[activeSpace]} transparency`}
            onChange={(event) =>
              updateTheme({
                ...theme,
                transparency: Number(event.target.value),
              })
            }
          />
        </label>

        {theme.mode === "gradient" ? (
          <>
            <label className="sidebar-theme-range">
              <span>
                <strong>Shade</strong>
                <small>
                  {theme.brightness === 0
                    ? "Balanced"
                    : theme.brightness < 0
                      ? "Darker"
                      : "Lighter"}
                </small>
              </span>
              <input
                type="range"
                min="-35"
                max="35"
                value={theme.brightness}
                aria-label={`${SPACE_LABELS[activeSpace]} shade`}
                onChange={(event) =>
                  updateTheme({
                    ...theme,
                    brightness: Number(event.target.value),
                  })
                }
              />
            </label>

            <fieldset className="sidebar-theme-field">
              <legend>Texture</legend>
              <div className="sidebar-theme-segmented">
                {TEXTURES.map((texture) => (
                  <button
                    type="button"
                    className={
                      theme.texture === texture.value ? "is-selected" : ""
                    }
                    aria-pressed={theme.texture === texture.value}
                    onClick={() =>
                      updateTheme({ ...theme, texture: texture.value })
                    }
                    key={texture.value}
                  >
                    {texture.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}
      </div>

      <button
        className="sidebar-theme-reset"
        type="button"
        onClick={() => updateTheme(resetSpaceSidebarTheme(activeSpace))}
      >
        Reset {SPACE_LABELS[activeSpace]} appearance
      </button>
    </div>
  );
}
