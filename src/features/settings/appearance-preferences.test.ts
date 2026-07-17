import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_PREFERENCES_KEY,
  LEGACY_APPEARANCE_PREFERENCES_KEY,
  V2_APPEARANCE_PREFERENCES_KEY,
  V3_APPEARANCE_PREFERENCES_KEY,
  accentTokens,
  applyAppearancePreferences,
  applyThemePreference,
  initializeAppearancePreferences,
  loadAppearancePreferences,
  setAppearancePreferences,
  setThemePreference,
} from "./appearance-preferences";

function createSystemTheme(dark = false) {
  let listener: (() => void) | undefined;
  const removeEventListener = vi.fn();
  const mediaQuery = {
    matches: dark,
    addEventListener: vi.fn((_event: string, nextListener: () => void) => {
      listener = nextListener;
    }),
    removeEventListener,
  } as unknown as MediaQueryList;

  return {
    mediaQuery,
    matchMedia: vi.fn(() => mediaQuery),
    removeEventListener,
    setDark(value: boolean) {
      Object.defineProperty(mediaQuery, "matches", {
        configurable: true,
        value,
      });
      listener?.();
    },
  };
}

describe("appearance preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
    document.documentElement.removeAttribute("data-surface-style");
    document.documentElement.style.colorScheme = "";
    document.documentElement.style.removeProperty("--accent");
  });

  it("migrates the v1 theme and defaults the new accent fields", () => {
    window.localStorage.setItem(
      LEGACY_APPEARANCE_PREFERENCES_KEY,
      JSON.stringify({ theme: "dark" }),
    );
    expect(loadAppearancePreferences()).toEqual({
      theme: "dark",
      accent: "coral",
      intensity: 100,
      surfaceStyle: "warm",
      visualPreset: "standard",
    });
  });

  it("migrates v2 appearance values to Warm surfaces", () => {
    window.localStorage.setItem(
      V2_APPEARANCE_PREFERENCES_KEY,
      JSON.stringify({ theme: "light", accent: "purple", intensity: 65 }),
    );
    expect(loadAppearancePreferences()).toEqual({
      theme: "light",
      accent: "purple",
      intensity: 65,
      surfaceStyle: "warm",
      visualPreset: "standard",
    });
  });

  it("migrates v3 appearance values to the Standard visual preset", () => {
    window.localStorage.setItem(
      V3_APPEARANCE_PREFERENCES_KEY,
      JSON.stringify({
        theme: "dark",
        accent: "yellow",
        intensity: 55,
        surfaceStyle: "flat",
      }),
    );
    expect(loadAppearancePreferences()).toEqual({
      theme: "dark",
      accent: "yellow",
      intensity: 55,
      surfaceStyle: "flat",
      visualPreset: "standard",
    });
  });

  it("falls back to System when persisted data is missing or invalid", () => {
    expect(loadAppearancePreferences()).toEqual({
      theme: "system",
      accent: "coral",
      intensity: 100,
      surfaceStyle: "warm",
      visualPreset: "standard",
    });

    window.localStorage.setItem(APPEARANCE_PREFERENCES_KEY, "not-json");
    expect(loadAppearancePreferences()).toEqual({
      theme: "system",
      accent: "coral",
      intensity: 100,
      surfaceStyle: "warm",
      visualPreset: "standard",
    });
  });

  it("persists and applies explicit Light and Dark choices", () => {
    const systemTheme = createSystemTheme(true);

    expect(
      setThemePreference("light", {
        document,
        storage: window.localStorage,
        matchMedia: systemTheme.matchMedia,
      }),
    ).toBe("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(loadAppearancePreferences()).toEqual({
      theme: "light",
      accent: "coral",
      intensity: 100,
      surfaceStyle: "warm",
      visualPreset: "standard",
    });

    applyThemePreference("dark", {
      document,
      matchMedia: systemTheme.matchMedia,
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe("#211e1b");
  });

  it("applies before render and follows system changes only in System mode", () => {
    const systemTheme = createSystemTheme(false);
    window.localStorage.setItem(
      APPEARANCE_PREFERENCES_KEY,
      JSON.stringify({ theme: "system" }),
    );

    const dispose = initializeAppearancePreferences({
      document,
      storage: window.localStorage,
      matchMedia: systemTheme.matchMedia,
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute(
      "data-theme-preference",
      "system",
    );

    systemTheme.setDark(true);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    setThemePreference("light", {
      document,
      storage: window.localStorage,
      matchMedia: systemTheme.matchMedia,
    });
    systemTheme.setDark(false);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    dispose();
    expect(systemTheme.removeEventListener).toHaveBeenCalledOnce();
  });

  it("creates theme-aware tokens for every accent at intensity bounds", () => {
    for (const accent of ["coral", "purple", "red", "yellow"] as const) {
      const subtle = accentTokens(accent, 25, "light");
      const vivid = accentTokens(accent, 100, "dark");
      expect(subtle.accent).toMatch(/^hsl\(/);
      expect(vivid.bright).toMatch(/^hsl\(/);
      expect(vivid.onAccent).toBe(accent === "yellow" ? "#211e1b" : "#fffaf2");
    }
  });

  it("applies Flat surfaces before render without dropping the accent", () => {
    applyAppearancePreferences(
      {
        theme: "dark",
        accent: "red",
        intensity: 75,
        surfaceStyle: "flat",
        visualPreset: "standard",
      },
      { document },
    );

    expect(document.documentElement).toHaveAttribute(
      "data-surface-style",
      "flat",
    );
    expect(document.documentElement).toHaveAttribute("data-accent", "red");
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe("#090909");
  });

  it("applies fixed Signal Red tokens without overwriting standard choices", () => {
    const preferences = {
      theme: "light",
      accent: "purple",
      intensity: 45,
      surfaceStyle: "warm",
      visualPreset: "signal-red",
    } as const;

    applyAppearancePreferences(preferences, { document });

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute(
      "data-visual-preset",
      "signal-red",
    );
    expect(document.documentElement).toHaveAttribute("data-accent", "red");
    expect(document.documentElement).toHaveAttribute(
      "data-surface-style",
      "flat",
    );
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "#e5062f",
    );
    expect(preferences).toMatchObject({
      theme: "light",
      accent: "purple",
      intensity: 45,
      surfaceStyle: "warm",
    });
  });

  it("restores the exact standard choices after Signal Red is disabled", () => {
    const signalPreferences = {
      theme: "light",
      accent: "purple",
      intensity: 45,
      surfaceStyle: "warm",
      visualPreset: "signal-red",
    } as const;
    setAppearancePreferences(signalPreferences, {
      document,
      storage: window.localStorage,
    });

    const stored = loadAppearancePreferences();
    setAppearancePreferences(
      { ...stored, visualPreset: "standard" },
      { document, storage: window.localStorage },
    );

    expect(loadAppearancePreferences()).toEqual({
      theme: "light",
      accent: "purple",
      intensity: 45,
      surfaceStyle: "warm",
      visualPreset: "standard",
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("data-accent", "purple");
    expect(document.documentElement).toHaveAttribute(
      "data-surface-style",
      "warm",
    );
  });
});
