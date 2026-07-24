import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEUTRAL_SYSTEM_ACCENT,
  applySystemAccent,
  chooseOnAccent,
  contrastRatio,
  normalizeSystemAccent,
  parseSystemAccent,
  readPreviewSystemAccent,
  systemAccentTesting,
  type ResolvedColorScheme,
  type SystemAccent,
} from "./system-accent";

function installMatchMedia(matches = false) {
  const changeListeners = new Set<() => void>();
  const removeEventListener = vi.fn((_name: string, listener: () => void) => {
    changeListeners.delete(listener);
  });
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_name: string, listener: () => void) => {
      changeListeners.add(listener);
    }),
    removeEventListener,
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal("matchMedia", matchMedia);
  return { changeListeners, matchMedia, media, removeEventListener };
}

afterEach(() => {
  systemAccentTesting.reset();
  document.documentElement.removeAttribute("data-color-scheme");
  document.documentElement.removeAttribute("data-system-accent-source");
  document.documentElement.removeAttribute("style");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("system accent payloads", () => {
  it("accepts only byte RGB channels and known sources", () => {
    expect(
      parseSystemAccent({
        red: 10,
        green: 132,
        blue: 255,
        source: "macos",
      }),
    ).toEqual({
      red: 10,
      green: 132,
      blue: 255,
      source: "macos",
    });
    expect(
      parseSystemAccent({
        red: 12.5,
        green: 0,
        blue: 0,
        source: "windows",
      }),
    ).toBeUndefined();
    expect(
      parseSystemAccent({
        red: -1,
        green: 0,
        blue: 256,
        source: "wallpaper",
      }),
    ).toBeUndefined();
    expect(parseSystemAccent(null)).toBeUndefined();
  });

  it("offers only the bounded red, blue, and Graphite mock-QA injections", () => {
    expect(readPreviewSystemAccent("?accent=red")).toMatchObject({
      red: 255,
      green: 59,
      blue: 48,
    });
    expect(readPreviewSystemAccent("?accent=blue")).toMatchObject({
      red: 10,
      green: 132,
      blue: 255,
    });
    expect(readPreviewSystemAccent("?accent=graphite")).toBe(
      NEUTRAL_SYSTEM_ACCENT,
    );
    expect(readPreviewSystemAccent("?accent=purple")).toBeUndefined();
  });

  it.each([
    ["black", { red: 0, green: 0, blue: 0 }],
    ["white", { red: 255, green: 255, blue: 255 }],
    ["yellow", { red: 255, green: 204, blue: 0 }],
    ["blue", { red: 10, green: 132, blue: 255 }],
    ["red", { red: 255, green: 59, blue: 48 }],
    ["graphite", { red: 128, green: 128, blue: 128 }],
  ])(
    "normalizes %s to readable accent text in both schemes",
    (_name, color) => {
      const canvases = {
        dark: { red: 9, green: 9, blue: 9 },
        light: { red: 250, green: 250, blue: 250 },
      } satisfies Record<ResolvedColorScheme, typeof color>;

      for (const scheme of ["dark", "light"] as const) {
        const normalized = normalizeSystemAccent(color, scheme);
        expect(
          contrastRatio(normalized, canvases[scheme]),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(
            normalized,
            chooseOnAccent(normalized) === "#000000"
              ? { red: 0, green: 0, blue: 0 }
              : { red: 255, green: 255, blue: 255 },
          ),
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("publishes the complete derived token family", () => {
    installMatchMedia(true);
    document.documentElement.dataset.colorScheme = "dark";
    const applied = applySystemAccent({
      red: 10,
      green: 132,
      blue: 255,
      source: "macos",
    });

    expect(applied.source).toBe("macos");
    expect(applied.scheme).toBe("dark");
    expect(document.documentElement.dataset.systemAccentSource).toBe("macos");
    for (const token of [
      "--system-accent-raw",
      "--system-accent",
      "--system-accent-on",
      "--system-accent-soft",
      "--system-accent-hover",
      "--system-accent-surface",
      "--system-accent-border",
    ]) {
      expect(document.documentElement.style.getPropertyValue(token)).not.toBe(
        "",
      );
    }
  });

  it("recomputes the normalized color when the resolved scheme changes", () => {
    installMatchMedia();
    const accent = {
      red: 0,
      green: 0,
      blue: 0,
      source: "windows",
    } satisfies SystemAccent;

    document.documentElement.dataset.colorScheme = "dark";
    const dark = applySystemAccent(accent);
    document.documentElement.dataset.colorScheme = "light";
    const light = applySystemAccent(accent);

    expect(dark.scheme).toBe("dark");
    expect(light.scheme).toBe("light");
    expect(dark.color).not.toBe(light.color);
    expect(light.color).toBe("#000000");
  });
});

describe("system accent runtime", () => {
  it("listens before querying, applies updates, refreshes on focus, and cleans up", async () => {
    const { removeEventListener } = installMatchMedia();
    const order: string[] = [];
    let emitAccent: ((payload: unknown) => void) | undefined;
    const unlisten = vi.fn();
    const queryNative = vi
      .fn<() => Promise<SystemAccent>>()
      .mockImplementation(() => {
        order.push("query");
        return Promise.resolve({
          red: 200,
          green: 90,
          blue: 40,
          source: "windows",
        });
      });
    const listenNative = vi.fn((listener: (payload: unknown) => void) => {
      order.push("listen");
      emitAccent = listener;
      return Promise.resolve(unlisten);
    });

    const cleanup = await systemAccentTesting.startRuntime({
      root: document.documentElement,
      window,
      isNative: () => true,
      queryNative,
      listenNative,
    });

    expect(order).toEqual(["listen", "query"]);
    expect(document.documentElement.dataset.systemAccentSource).toBe("windows");

    emitAccent?.({ red: 90, green: 80, blue: 170, source: "macos" });
    expect(document.documentElement.dataset.systemAccentSource).toBe("macos");

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(queryNative).toHaveBeenCalledTimes(2));

    cleanup();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  it("uses the neutral fallback for browser mode and failed native reads", async () => {
    installMatchMedia();
    const queryNative = vi.fn().mockRejectedValue(new Error("no bridge"));

    const browserCleanup = await systemAccentTesting.startRuntime({
      root: document.documentElement,
      window,
      isNative: () => false,
      queryNative,
      listenNative: vi.fn(),
    });
    expect(queryNative).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.systemAccentSource).toBe(
      NEUTRAL_SYSTEM_ACCENT.source,
    );
    browserCleanup();

    const nativeCleanup = await systemAccentTesting.startRuntime({
      root: document.documentElement,
      window,
      isNative: () => true,
      queryNative,
      listenNative: vi.fn().mockResolvedValue(vi.fn()),
    });
    expect(document.documentElement.dataset.systemAccentSource).toBe(
      "fallback",
    );
    nativeCleanup();

    queryNative.mockResolvedValue({
      red: 44,
      green: 104,
      blue: 190,
      source: "windows",
    });
    const queryOnlyCleanup = await systemAccentTesting.startRuntime({
      root: document.documentElement,
      window,
      isNative: () => true,
      queryNative,
      listenNative: vi.fn().mockRejectedValue(new Error("events blocked")),
    });
    expect(document.documentElement.dataset.systemAccentSource).toBe("windows");
    queryOnlyCleanup();
  });
});
