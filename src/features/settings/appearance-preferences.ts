export const APPEARANCE_PREFERENCES_KEY = "bakbak.appearancePreferences.v6";
export const V5_APPEARANCE_PREFERENCES_KEY = "bakbak.appearancePreferences.v5";
export const V4_APPEARANCE_PREFERENCES_KEY = "bakbak.appearancePreferences.v4";
export const V3_APPEARANCE_PREFERENCES_KEY = "bakbak.appearancePreferences.v3";
export const V2_APPEARANCE_PREFERENCES_KEY = "bakbak.appearancePreferences.v2";
export const LEGACY_APPEARANCE_PREFERENCES_KEY =
  "bakbak.appearancePreferences.v1";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;
export type AccentColor = "coral" | "purple" | "red" | "yellow";
export type SurfaceStyle = "warm" | "flat";
export type VisualPreset = "signature" | "standard" | "signal-red";

export interface AppearancePreferences {
  theme: ThemePreference;
  accent: AccentColor;
  intensity: number;
  surfaceStyle: SurfaceStyle;
  visualPreset: VisualPreset;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface AppearanceEnvironment {
  document?: Document;
  storage?: StorageLike;
  matchMedia?: (query: string) => MediaQueryList;
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  theme: "system",
  accent: "purple",
  intensity: 100,
  surfaceStyle: "flat",
  visualPreset: "standard",
};
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f3ede3",
  dark: "#211e1b",
};
const ACCENT_HUES: Record<AccentColor, number> = {
  coral: 12,
  purple: 276,
  red: 355,
  yellow: 44,
};

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isAccentColor(value: unknown): value is AccentColor {
  return (
    value === "coral" ||
    value === "purple" ||
    value === "red" ||
    value === "yellow"
  );
}

function isIntensity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 25 &&
    value <= 100 &&
    value % 5 === 0
  );
}

function isSurfaceStyle(value: unknown): value is SurfaceStyle {
  return value === "warm" || value === "flat";
}

function isVisualPreset(value: unknown): value is VisualPreset {
  return (
    value === "signature" || value === "standard" || value === "signal-red"
  );
}

function browserDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserMatchMedia(): ((query: string) => MediaQueryList) | undefined {
  if (typeof window === "undefined" || !window.matchMedia) return undefined;
  return window.matchMedia.bind(window);
}

function environmentWithDefaults(
  environment: AppearanceEnvironment,
): Required<Pick<AppearanceEnvironment, "document">> & AppearanceEnvironment {
  return {
    document: environment.document ?? browserDocument(),
    storage: environment.storage ?? browserStorage(),
    matchMedia: environment.matchMedia ?? browserMatchMedia(),
  } as Required<Pick<AppearanceEnvironment, "document">> &
    AppearanceEnvironment;
}

function readStoredPreferences(storage: StorageLike, key: string): unknown {
  return JSON.parse(storage.getItem(key) ?? "null") as unknown;
}

function persistMigration(
  storage: StorageLike,
  preferences: AppearancePreferences,
): AppearancePreferences {
  try {
    storage.setItem(APPEARANCE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Migration still applies for this session when storage is read-only.
  }
  return preferences;
}

export function loadAppearancePreferences(
  storage: StorageLike | undefined = browserStorage(),
): AppearancePreferences {
  if (!storage) return DEFAULT_APPEARANCE_PREFERENCES;
  try {
    const value = readStoredPreferences(storage, APPEARANCE_PREFERENCES_KEY);
    if (
      value &&
      typeof value === "object" &&
      "theme" in value &&
      "accent" in value &&
      "intensity" in value &&
      "surfaceStyle" in value &&
      "visualPreset" in value &&
      isThemePreference(value.theme) &&
      isAccentColor(value.accent) &&
      isIntensity(value.intensity) &&
      isSurfaceStyle(value.surfaceStyle) &&
      isVisualPreset(value.visualPreset)
    ) {
      return {
        theme: value.theme,
        accent: value.accent,
        intensity: value.intensity,
        surfaceStyle: value.surfaceStyle,
        visualPreset: value.visualPreset,
      };
    }

    // v6 intentionally resets every older installation once. Choices made
    // after this migration are stored under v6 and remain user-controlled.
    return persistMigration(storage, DEFAULT_APPEARANCE_PREFERENCES);
  } catch {
    // Corrupt or inaccessible preferences must never block startup.
  }
  return DEFAULT_APPEARANCE_PREFERENCES;
}

export function saveAppearancePreferences(
  preferences: AppearancePreferences,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(APPEARANCE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Applying an appearance still works when persistence is unavailable.
  }
}

export function resolveThemePreference(
  preference: ThemePreference,
  matchMedia: AppearanceEnvironment["matchMedia"] = browserMatchMedia(),
): ResolvedTheme {
  if (preference !== "system") return preference;
  return matchMedia?.(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
}

export function accentTokens(
  accent: AccentColor,
  intensity: number,
  theme: ResolvedTheme,
) {
  const hue = ACCENT_HUES[accent];
  const strength = Math.max(25, Math.min(100, intensity)) / 100;
  const saturation = Math.round(35 + strength * 48);
  const yellow = accent === "yellow";
  const lightness = yellow
    ? theme === "light"
      ? 38
      : 63
    : theme === "light"
      ? 44
      : 63;
  const brightLightness = yellow
    ? theme === "light"
      ? 33
      : 70
    : theme === "light"
      ? 39
      : 69;
  const alpha = (0.07 + strength * 0.09).toFixed(3);
  const borderAlpha = (0.25 + strength * 0.3).toFixed(3);
  return {
    accent: `hsl(${hue} ${saturation}% ${lightness}%)`,
    bright: `hsl(${hue} ${Math.min(92, saturation + 6)}% ${brightLightness}%)`,
    soft: `hsl(${hue} ${saturation}% ${lightness}% / ${alpha})`,
    border: `hsl(${hue} ${saturation}% ${lightness}% / ${borderAlpha})`,
    glow: `hsl(${hue} ${saturation}% ${lightness}% / ${(0.035 + strength * 0.055).toFixed(3)})`,
    onAccent: yellow ? "#211e1b" : "#fffaf2",
  };
}

export function applyAppearancePreferences(
  preferences: AppearancePreferences,
  environment: AppearanceEnvironment = {},
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(
    preferences.theme,
    environment.matchMedia ?? browserMatchMedia(),
  );
  const signalRed = preferences.visualPreset === "signal-red";
  const signature = preferences.visualPreset === "signature";
  const fixedPreset = signalRed || signature;
  const effectiveTheme = fixedPreset ? "dark" : resolvedTheme;
  const targetDocument = environment.document ?? browserDocument();
  if (!targetDocument) return effectiveTheme;

  const root = targetDocument.documentElement;
  const tokens = signalRed
    ? {
        accent: "#e5062f",
        bright: "#ff2648",
        soft: "rgb(229 6 47 / 0.14)",
        border: "rgb(229 6 47 / 0.58)",
        glow: "rgb(229 6 47 / 0.09)",
        onAccent: "#f4f2ef",
      }
    : signature
      ? {
          accent: "#8b4a2f",
          bright: "#d1b06e",
          soft: "rgb(139 74 47 / 0.18)",
          border: "rgb(209 176 110 / 0.5)",
          glow: "rgb(209 176 110 / 0.08)",
          onAccent: "#fff8ef",
        }
      : accentTokens(preferences.accent, preferences.intensity, resolvedTheme);
  root.dataset.theme = effectiveTheme;
  root.dataset.themePreference = preferences.theme;
  root.dataset.accent = signalRed
    ? "red"
    : signature
      ? "coral"
      : preferences.accent;
  root.dataset.accentIntensity = String(
    fixedPreset ? 100 : preferences.intensity,
  );
  root.dataset.surfaceStyle = signalRed
    ? "flat"
    : signature
      ? "warm"
      : preferences.surfaceStyle;
  root.dataset.visualPreset = preferences.visualPreset;
  root.style.colorScheme = effectiveTheme;
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--accent-bright", tokens.bright);
  root.style.setProperty("--accent-soft", tokens.soft);
  root.style.setProperty("--accent-border", tokens.border);
  root.style.setProperty("--canvas-glow", tokens.glow);
  root.style.setProperty("--on-accent", tokens.onAccent);

  let themeColor = targetDocument.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!themeColor) {
    themeColor = targetDocument.createElement("meta");
    themeColor.name = "theme-color";
    targetDocument.head.append(themeColor);
  }
  themeColor.content = fixedPreset
    ? signalRed
      ? "#050505"
      : "#100d0b"
    : preferences.surfaceStyle === "flat"
      ? resolvedTheme === "dark"
        ? "#090909"
        : "#ffffff"
      : THEME_COLORS[resolvedTheme];
  return effectiveTheme;
}

export function setAppearancePreferences(
  preferences: AppearancePreferences,
  environment: AppearanceEnvironment = {},
): ResolvedTheme {
  const resolvedEnvironment = environmentWithDefaults(environment);
  saveAppearancePreferences(preferences, resolvedEnvironment.storage);
  return applyAppearancePreferences(preferences, resolvedEnvironment);
}

export function setThemePreference(
  preference: ThemePreference,
  environment: AppearanceEnvironment = {},
): ResolvedTheme {
  const resolvedEnvironment = environmentWithDefaults(environment);
  const current = loadAppearancePreferences(resolvedEnvironment.storage);
  return setAppearancePreferences(
    { ...current, theme: preference },
    resolvedEnvironment,
  );
}

export function applyThemePreference(
  preference: ThemePreference,
  environment: AppearanceEnvironment = {},
): ResolvedTheme {
  return applyAppearancePreferences(
    { ...loadAppearancePreferences(environment.storage), theme: preference },
    environment,
  );
}

export function initializeAppearancePreferences(
  environment: AppearanceEnvironment = {},
): () => void {
  const resolvedEnvironment = environmentWithDefaults(environment);
  const preferences = loadAppearancePreferences(resolvedEnvironment.storage);
  applyAppearancePreferences(preferences, resolvedEnvironment);
  const mediaQuery = resolvedEnvironment.matchMedia?.(SYSTEM_DARK_QUERY);
  if (!mediaQuery) return () => undefined;

  const handleSystemThemeChange = () => {
    const latest = loadAppearancePreferences(resolvedEnvironment.storage);
    if (latest.theme === "system") {
      applyAppearancePreferences(latest, resolvedEnvironment);
    }
  };
  mediaQuery.addEventListener("change", handleSystemThemeChange);
  return () =>
    mediaQuery.removeEventListener("change", handleSystemThemeChange);
}
