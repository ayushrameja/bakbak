import { describe, expect, it, vi } from "vitest";
import themeBootstrap from "../../../public/theme-init.js?raw";

describe("pre-React appearance bootstrap", () => {
  it("applies a persisted Flat surface and accent on first paint", () => {
    const root = createRoot();
    const themeColor = { setAttribute: vi.fn() };

    executeBootstrap(themeBootstrap, {
      document: {
        documentElement: root,
        querySelector: () => themeColor,
      },
      localStorage: storageWith({
        "bakbak.appearancePreferences.v3": JSON.stringify({
          theme: "dark",
          accent: "purple",
          intensity: 70,
          surfaceStyle: "flat",
        }),
      }),
      matchMedia: () => ({ matches: false }),
    });

    expect(root.dataset).toMatchObject({
      theme: "dark",
      accent: "purple",
      accentIntensity: "70",
      surfaceStyle: "flat",
      visualPreset: "standard",
    });
    expect(root.style.colorScheme).toBe("dark");
    expect(themeColor.setAttribute).toHaveBeenCalledWith("content", "#090909");
  });

  it("migrates v2 bootstrap values to Warm without losing their accent", () => {
    const root = createRoot();

    executeBootstrap(themeBootstrap, {
      document: {
        documentElement: root,
        querySelector: () => null,
      },
      localStorage: storageWith({
        "bakbak.appearancePreferences.v2": JSON.stringify({
          theme: "light",
          accent: "yellow",
          intensity: 55,
        }),
      }),
      matchMedia: () => ({ matches: true }),
    });

    expect(root.dataset).toMatchObject({
      theme: "light",
      accent: "yellow",
      accentIntensity: "55",
      surfaceStyle: "warm",
      visualPreset: "standard",
    });
  });

  it("applies fixed Signal Red values before React mounts", () => {
    const root = createRoot();
    const themeColor = { setAttribute: vi.fn() };

    executeBootstrap(themeBootstrap, {
      document: {
        documentElement: root,
        querySelector: () => themeColor,
      },
      localStorage: storageWith({
        "bakbak.appearancePreferences.v4": JSON.stringify({
          theme: "light",
          accent: "purple",
          intensity: 35,
          surfaceStyle: "warm",
          visualPreset: "signal-red",
        }),
      }),
      matchMedia: () => ({ matches: false }),
    });

    expect(root.dataset).toMatchObject({
      theme: "dark",
      accent: "red",
      accentIntensity: "100",
      surfaceStyle: "flat",
      visualPreset: "signal-red",
    });
    expect(root.style.setProperty).toHaveBeenCalledWith("--accent", "#e5062f");
    expect(themeColor.setAttribute).toHaveBeenCalledWith("content", "#050505");
  });
});

function createRoot() {
  return {
    dataset: {} as Record<string, string>,
    style: {
      colorScheme: "",
      setProperty: vi.fn(),
    },
  };
}

function storageWith(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
  };
}

function executeBootstrap(script: string, context: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- Execute the checked-in bootstrap against an isolated fake global.
  Function("globalThis", script)(context);
}
