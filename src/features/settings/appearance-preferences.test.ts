import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_PREFERENCES_KEY,
  LEGACY_APPEARANCE_PREFERENCES_KEY,
  V2_APPEARANCE_PREFERENCES_KEY,
  V3_APPEARANCE_PREFERENCES_KEY,
  V4_APPEARANCE_PREFERENCES_KEY,
  V5_APPEARANCE_PREFERENCES_KEY,
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

  it.each([
    [LEGACY_APPEARANCE_PREFERENCES_KEY, { theme: "dark" }],
    [
      V2_APPEARANCE_PREFERENCES_KEY,
      { theme: "light", accent: "yellow", intensity: 65 },
    ],
    [
      V3_APPEARANCE_PREFERENCES_KEY,
      {
        theme: "dark",
        accent: "yellow",
        intensity: 55,
        surfaceStyle: "warm",
      },
    ],
    [
      V4_APPEARANCE_PREFERENCES_KEY,
      {
        theme: "light",
        accent: "red",
        intensity: 45,
        surfaceStyle: "warm",
        visualPreset: "signal-red",
      },
    ],
    [
      V5_APPEARANCE_PREFERENCES_KEY,
      {
        theme: "dark",
        accent: "coral",
        intensity: 80,
        surfaceStyle: "warm",
        visualPreset: "signature",
      },
    ],
  ])("resets the older %s choice once during the v6 update", (key, value) => {
    window.localStorage.setItem(key, JSON.stringify(value));

    expect(loadAppearancePreferences()).toEqual({
      theme: "system",
      accent: "purple",
      intensity: 100,
      surfaceStyle: "flat",
      visualPreset: "standard",
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(APPEARANCE_PREFERENCES_KEY) ?? "null",
      ),
    ).toEqual({
      theme: "system",
      accent: "purple",
      intensity: 100,
      surfaceStyle: "flat",
      visualPreset: "standard",
    });
  });

  it("defaults missing or invalid preferences to Flat Purple Classic", () => {
    expect(loadAppearancePreferences()).toEqual({
      theme: "system",
      accent: "purple",
      intensity: 100,
      surfaceStyle: "flat",
      visualPreset: "standard",
    });

    window.localStorage.setItem(APPEARANCE_PREFERENCES_KEY, "not-json");
    expect(loadAppearancePreferences()).toEqual({
      theme: "system",
      accent: "purple",
      intensity: 100,
      surfaceStyle: "flat",
      visualPreset: "standard",
    });
  });

  it("persists and applies explicit Light and Dark choices", () => {
    const systemTheme = createSystemTheme(true);
    window.localStorage.setItem(
      APPEARANCE_PREFERENCES_KEY,
      JSON.stringify({
        theme: "system",
        accent: "coral",
        intensity: 100,
        surfaceStyle: "warm",
        visualPreset: "standard",
      }),
    );

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
      JSON.stringify({
        theme: "system",
        accent: "coral",
        intensity: 100,
        surfaceStyle: "warm",
        visualPreset: "standard",
      }),
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

  it("keeps Signature body and secondary text above WCAG AA contrast", () => {
    expect(contrastRatio("#f2ece2", "#171310")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#b9aea2", "#211a15")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#d1b06e", "#211a15")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#62b7a4", "#171310")).toBeGreaterThanOrEqual(3);
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

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (
      channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    );
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
