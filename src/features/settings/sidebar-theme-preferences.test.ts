import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_THEME_PREFERENCES,
  loadSidebarThemePreferences,
  readSidebarThemePreferences,
  saveSidebarThemePreferences,
  sidebarThemeStyle,
} from "./sidebar-theme-preferences";

describe("sidebar theme preferences", () => {
  it("keeps preferences separate per account", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const preferences = structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES);
    preferences.onboardingComplete = true;
    preferences.spaces.server.colors[0] = "#123456";
    saveSidebarThemePreferences("user-a", preferences, storage);

    expect(loadSidebarThemePreferences("user-a", storage)).toEqual(preferences);
    expect(loadSidebarThemePreferences("user-b", storage)).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES,
    );
  });

  it("sanitizes malformed colors and slider values", () => {
    const preferences = readSidebarThemePreferences({
      onboardingComplete: true,
      spaces: {
        server: {
          mode: "gradient",
          colors: ["red", "#123456", "#abcdef"],
          brightness: 999,
          transparency: -4,
          texture: "confetti",
        },
      },
    });

    expect(preferences.onboardingComplete).toBe(true);
    expect(preferences.spaces.server.colors).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server.colors,
    );
    expect(preferences.spaces.server.points).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server.points,
    );
    expect(preferences.spaces.server.brightness).toBe(35);
    expect(preferences.spaces.server.transparency).toBe(0);
    expect(preferences.spaces.server.texture).toBe("none");
    expect(preferences.spaces.personal).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal,
    );
  });

  it("builds solid and three-stop gradient styles", () => {
    const solid = sidebarThemeStyle({
      mode: "solid",
      colors: ["#000000", "#ffffff", "#ffffff"],
      points: [
        { x: 20, y: 20 },
        { x: 50, y: 50 },
        { x: 80, y: 80 },
      ],
      brightness: 20,
      transparency: 25,
      texture: "dots",
    });
    expect(solid["--space-gradient"]).toBe(
      "linear-gradient(rgba(51, 51, 51, 0.75), rgba(51, 51, 51, 0.75))",
    );

    const gradient = sidebarThemeStyle(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal,
    );
    expect(gradient["--space-gradient"]).toMatch(
      /linear-gradient\(\d+deg,[\s\S]+\d+%/,
    );
    expect(gradient["--space-gradient"]).toContain("rgba(81, 47, 67, 1)");

    expect(
      sidebarThemeStyle({
        ...DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server,
        transparency: 45,
      })["--space-gradient"],
    ).toContain("0.55");
  });
});
