import { describe, expect, it, vi } from "vitest";
import themeBootstrap from "../../../public/theme-init.js?raw";

describe("pre-React appearance bootstrap", () => {
  it("applies Flat Purple Classic on first paint when no preference exists", () => {
    const root = createRoot();
    const themeColor = { setAttribute: vi.fn() };
    const storage = storageWith({});

    executeBootstrap(themeBootstrap, {
      document: {
        documentElement: root,
        querySelector: () => themeColor,
      },
      localStorage: storage,
      matchMedia: () => ({ matches: false }),
    });

    expect(root.dataset).toMatchObject({
      theme: "light",
      accent: "purple",
      accentIntensity: "100",
      surfaceStyle: "flat",
      visualPreset: "standard",
    });
    expect(root.style.setProperty).toHaveBeenCalledWith(
      "--accent-bright",
      "hsl(276 89% 39%)",
    );
    expect(themeColor.setAttribute).toHaveBeenCalledWith("content", "#ffffff");
    expect(storage.setItem).toHaveBeenCalledWith(
      "bakbak.appearancePreferences.v6",
      JSON.stringify({
        theme: "system",
        accent: "purple",
        intensity: 100,
        surfaceStyle: "flat",
        visualPreset: "standard",
      }),
    );
  });

  it("resets a v5 Signature choice before first paint", () => {
    const root = createRoot();
    const themeColor = { setAttribute: vi.fn() };

    executeBootstrap(themeBootstrap, {
      document: {
        documentElement: root,
        querySelector: () => themeColor,
      },
      localStorage: storageWith({
        "bakbak.appearancePreferences.v5": JSON.stringify({
          theme: "dark",
          accent: "coral",
          intensity: 70,
          surfaceStyle: "warm",
          visualPreset: "signature",
        }),
      }),
      matchMedia: () => ({ matches: false }),
    });

    expect(root.dataset).toMatchObject({
      theme: "light",
      accent: "purple",
      accentIntensity: "100",
      surfaceStyle: "flat",
      visualPreset: "standard",
    });
    expect(root.style.colorScheme).toBe("light");
    expect(themeColor.setAttribute).toHaveBeenCalledWith("content", "#ffffff");
  });

  it("preserves choices made after the v6 reset", () => {
    const root = createRoot();

    executeBootstrap(themeBootstrap, {
      document: {
        documentElement: root,
        querySelector: () => null,
      },
      localStorage: storageWith({
        "bakbak.appearancePreferences.v6": JSON.stringify({
          theme: "light",
          accent: "yellow",
          intensity: 55,
          surfaceStyle: "warm",
          visualPreset: "standard",
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
        "bakbak.appearancePreferences.v6": JSON.stringify({
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
    setItem: vi.fn(),
  };
}

function executeBootstrap(script: string, context: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- Execute the checked-in bootstrap against an isolated fake global.
  Function("globalThis", script)(context);
}
