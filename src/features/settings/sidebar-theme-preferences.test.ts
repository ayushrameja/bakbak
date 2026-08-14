import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHROME_THEME_TRANSPARENCY,
  DEFAULT_SIDEBAR_THEME_PREFERENCES,
  MAX_CHROME_THEME_TRANSPARENCY,
  MIN_CHROME_THEME_TRANSPARENCY,
  loadSidebarThemePreferences,
  readSidebarThemePreferences,
  resetSpaceSidebarTheme,
  saveSidebarThemePreferences,
  sidebarThemeStorageKey,
  sidebarThemeStyle,
} from "./sidebar-theme-preferences";

function memoryStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  };
}

describe("chrome theme preferences", () => {
  it("defaults both spaces to glass without an onboarding flag", () => {
    expect(DEFAULT_SIDEBAR_THEME_PREFERENCES).not.toHaveProperty(
      "onboardingComplete",
    );
    expect(DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server.mode).toBe("glass");
    expect(DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal.mode).toBe(
      "glass",
    );
    expect(DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server.transparency).toBe(
      DEFAULT_CHROME_THEME_TRANSPARENCY,
    );
    expect(sidebarThemeStorageKey("user-a")).toBe(
      "bakbak.chromeThemes.v2:user-a",
    );
  });

  it("keeps v2 preferences separate per account", () => {
    const { storage, values } = memoryStorage();
    const preferences = structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES);
    preferences.spaces.server.mode = "gradient";
    preferences.spaces.server.colors[0] = "#123456";
    saveSidebarThemePreferences("user-a", preferences, storage);

    expect(loadSidebarThemePreferences("user-a", storage)).toEqual(preferences);
    expect(loadSidebarThemePreferences("user-b", storage)).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES,
    );
    expect(values.has("bakbak.chromeThemes.v2:user-a")).toBe(true);
    expect(values.has("bakbak.sidebarThemes.v1:user-a")).toBe(false);
  });

  it("promotes the untouched previous Glass default to 100% transparency", () => {
    const previous = structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES);
    previous.spaces.server.transparency = 45;
    previous.spaces.personal.transparency = 45;
    const { storage, values } = memoryStorage({
      "bakbak.chromeThemes.v2:user-a": previous,
    });

    const migrated = loadSidebarThemePreferences("user-a", storage);

    expect(migrated.spaces.server.transparency).toBe(100);
    expect(migrated.spaces.personal.transparency).toBe(100);
    expect(
      JSON.parse(values.get("bakbak.chromeThemes.v2:user-a") ?? "null"),
    ).toEqual(migrated);
  });

  it("sanitizes malformed modes, colors, points, and slider values", () => {
    const preferences = readSidebarThemePreferences({
      onboardingComplete: true,
      spaces: {
        server: {
          mode: "fog",
          colors: ["red", "#123456", "#abcdef"],
          points: [{ x: 200, y: -40 }],
          brightness: 999,
          transparency: -4,
          texture: "confetti",
        },
      },
    });

    expect(preferences).not.toHaveProperty("onboardingComplete");
    expect(preferences.spaces.server.mode).toBe("glass");
    expect(preferences.spaces.server.colors).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server.colors,
    );
    expect(preferences.spaces.server.points).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server.points,
    );
    expect(preferences.spaces.server.brightness).toBe(35);
    expect(preferences.spaces.server.transparency).toBe(
      MIN_CHROME_THEME_TRANSPARENCY,
    );
    expect(preferences.spaces.server.texture).toBe("none");
    expect(preferences.spaces.personal).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal,
    );
  });

  it("migrates each v1 space independently and leaves the old record intact", () => {
    const legacyServer = {
      mode: "gradient",
      colors: ["#5d4c31", "#24504d", "#0d1727"],
      // The first picker version did not persist point positions.
      brightness: 0,
      transparency: 0,
      texture: "none",
    };
    const legacyPersonal = {
      mode: "solid",
      colors: ["#123456", "#44385e", "#0d1727"],
      points: [
        { x: 25, y: 22 },
        { x: 57, y: 49 },
        { x: 78, y: 80 },
      ],
      brightness: 8,
      transparency: 20,
      texture: "grain",
    };
    const { storage, values } = memoryStorage({
      "bakbak.sidebarThemes.v1:user-a": {
        onboardingComplete: true,
        spaces: { server: legacyServer, personal: legacyPersonal },
      },
    });

    const migrated = loadSidebarThemePreferences("user-a", storage);

    expect(migrated.spaces.server).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server,
    );
    expect(migrated.spaces.personal).toMatchObject({
      mode: "gradient",
      colors: ["#123456", "#123456", "#123456"],
      brightness: 8,
      transparency: 20,
      texture: "grain",
    });
    expect(values.has("bakbak.sidebarThemes.v1:user-a")).toBe(true);
    expect(
      JSON.parse(values.get("bakbak.chromeThemes.v2:user-a") ?? "null"),
    ).toEqual(migrated);
  });

  it("keeps a customized v1 gradient while converting the other default space", () => {
    const legacy = structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES);
    legacy.spaces.server.mode = "gradient";
    legacy.spaces.server.colors[1] = "#345678";
    legacy.spaces.personal.mode = "gradient";
    legacy.spaces.personal.transparency = 0;
    const { storage } = memoryStorage({
      "bakbak.sidebarThemes.v1:user-a": legacy,
    });

    const migrated = loadSidebarThemePreferences("user-a", storage);

    expect(migrated.spaces.server.mode).toBe("gradient");
    expect(migrated.spaces.server.colors[1]).toBe("#345678");
    expect(migrated.spaces.personal.mode).toBe("glass");
  });

  it("turns corrupt v1 data into a persisted safe glass default", () => {
    const values = new Map<string, string>([
      ["bakbak.sidebarThemes.v1:user-a", "not-json"],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(loadSidebarThemePreferences("user-a", storage)).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES,
    );
    expect(
      JSON.parse(values.get("bakbak.chromeThemes.v2:user-a") ?? "null"),
    ).toEqual(DEFAULT_SIDEBAR_THEME_PREFERENCES);
  });

  it("builds adjustable Glass and transparent three-stop gradient styles", () => {
    expect(
      sidebarThemeStyle(DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server)[
        "--space-gradient"
      ],
    ).toContain(
      `var(--conversation-canvas) ${100 - DEFAULT_CHROME_THEME_TRANSPARENCY}%`,
    );

    const gradient = sidebarThemeStyle({
      ...DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server,
      mode: "gradient",
      colors: ["#000000", "#ffffff", "#ffffff"],
      brightness: 20,
      transparency: 25,
      texture: "dots",
    });
    expect(gradient["--space-gradient"]).toMatch(
      /linear-gradient\(\d+deg,[\s\S]+\d+%/,
    );
    expect(gradient["--space-gradient"]).toContain("rgba(51, 51, 51, 0.75)");
  });

  it("converts saved solid themes and opaque values to transparent gradients", () => {
    const preferences = readSidebarThemePreferences({
      spaces: {
        server: {
          mode: "solid",
          colors: ["#123456", "#abcdef", "#fedcba"],
          points: [
            { x: 22, y: 24 },
            { x: 55, y: 50 },
            { x: 80, y: 78 },
          ],
          brightness: 0,
          transparency: 0,
          texture: "none",
        },
        personal: {
          ...DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal,
          transparency: 999,
        },
      },
    });

    expect(preferences.spaces.server).toMatchObject({
      mode: "gradient",
      colors: ["#123456", "#123456", "#123456"],
      transparency: MIN_CHROME_THEME_TRANSPARENCY,
    });
    expect(preferences.spaces.personal.transparency).toBe(
      MAX_CHROME_THEME_TRANSPARENCY,
    );
  });

  it("resets a customized space to glass while restoring dormant defaults", () => {
    expect(resetSpaceSidebarTheme("personal")).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal,
    );
    expect(resetSpaceSidebarTheme("personal").mode).toBe("glass");
  });
});
