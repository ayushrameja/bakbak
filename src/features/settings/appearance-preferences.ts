import { reapplySystemAccent } from "./system-accent";

export const APPEARANCE_PREFERENCE_KEY = "bakbak.appearancePreference.v1";

export type AppearancePreference = "auto" | "light" | "dark";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readAppearancePreference(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" ? value : "auto";
}

export function loadAppearancePreference(
  storage: StorageLike | undefined = browserStorage(),
): AppearancePreference {
  if (!storage) return "auto";
  try {
    return readAppearancePreference(storage.getItem(APPEARANCE_PREFERENCE_KEY));
  } catch {
    return "auto";
  }
}

export function applyAppearancePreference(
  preference: AppearancePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === "auto") root.removeAttribute("data-color-scheme");
  else root.dataset.colorScheme = preference;

  const darkMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-scheme="dark"]',
  );
  const lightMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-scheme="light"]',
  );
  if (preference === "auto") {
    darkMeta?.setAttribute("media", "(prefers-color-scheme: dark)");
    lightMeta?.setAttribute("media", "(prefers-color-scheme: light)");
  } else {
    darkMeta?.setAttribute("media", preference === "dark" ? "all" : "not all");
    lightMeta?.setAttribute(
      "media",
      preference === "light" ? "all" : "not all",
    );
  }

  reapplySystemAccent();
}

export function saveAppearancePreference(
  preference: AppearancePreference,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(APPEARANCE_PREFERENCE_KEY, preference);
  } catch {
    // The selected scheme still applies for this session if storage is blocked.
  }
}
