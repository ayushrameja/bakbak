export const APPEARANCE_PREFERENCES_KEY = "bakbak.appearancePreferences.v1";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export interface AppearancePreferences {
  theme: ThemePreference;
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

const DEFAULT_PREFERENCES: AppearancePreferences = { theme: "system" };
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f3ede3",
  dark: "#211e1b",
};

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function browserDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserMatchMedia(): ((query: string) => MediaQueryList) | undefined {
  if (typeof window === "undefined" || !window.matchMedia) {
    return undefined;
  }

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

export function loadAppearancePreferences(
  storage: StorageLike | undefined = browserStorage(),
): AppearancePreferences {
  if (!storage) {
    return DEFAULT_PREFERENCES;
  }

  try {
    const value: unknown = JSON.parse(
      storage.getItem(APPEARANCE_PREFERENCES_KEY) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "theme" in value &&
      isThemePreference(value.theme)
    ) {
      return { theme: value.theme };
    }
  } catch {
    // A corrupt or inaccessible preference should never block app startup.
  }

  return DEFAULT_PREFERENCES;
}

export function saveAppearancePreferences(
  preferences: AppearancePreferences,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(APPEARANCE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Applying a theme still works when persistence is unavailable.
  }
}

export function resolveThemePreference(
  preference: ThemePreference,
  matchMedia: AppearanceEnvironment["matchMedia"] = browserMatchMedia(),
): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }

  return matchMedia?.(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
}

export function applyThemePreference(
  preference: ThemePreference,
  environment: AppearanceEnvironment = {},
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(
    preference,
    environment.matchMedia ?? browserMatchMedia(),
  );
  const targetDocument = environment.document ?? browserDocument();

  if (!targetDocument) {
    return resolvedTheme;
  }

  const root = targetDocument.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;

  let themeColor = targetDocument.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!themeColor) {
    themeColor = targetDocument.createElement("meta");
    themeColor.name = "theme-color";
    targetDocument.head.append(themeColor);
  }
  themeColor.content = THEME_COLORS[resolvedTheme];

  return resolvedTheme;
}

export function setThemePreference(
  preference: ThemePreference,
  environment: AppearanceEnvironment = {},
): ResolvedTheme {
  const resolvedEnvironment = environmentWithDefaults(environment);
  saveAppearancePreferences({ theme: preference }, resolvedEnvironment.storage);
  return applyThemePreference(preference, resolvedEnvironment);
}

/**
 * Synchronously applies the stored theme before React renders, then keeps a
 * System preference in sync with the operating system. Call the returned
 * cleanup when the application is torn down.
 */
export function initializeAppearancePreferences(
  environment: AppearanceEnvironment = {},
): () => void {
  const resolvedEnvironment = environmentWithDefaults(environment);
  const preferences = loadAppearancePreferences(resolvedEnvironment.storage);
  applyThemePreference(preferences.theme, resolvedEnvironment);

  const mediaQuery = resolvedEnvironment.matchMedia?.(SYSTEM_DARK_QUERY);
  if (!mediaQuery) {
    return () => undefined;
  }

  const handleSystemThemeChange = () => {
    const latest = loadAppearancePreferences(resolvedEnvironment.storage);
    if (latest.theme === "system") {
      applyThemePreference("system", resolvedEnvironment);
    }
  };

  mediaQuery.addEventListener("change", handleSystemThemeChange);
  return () => {
    mediaQuery.removeEventListener("change", handleSystemThemeChange);
  };
}
