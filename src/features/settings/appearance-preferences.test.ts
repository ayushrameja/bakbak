import { afterEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_PREFERENCE_KEY,
  applyAppearancePreference,
  loadAppearancePreference,
  saveAppearancePreference,
} from "./appearance-preferences";

describe("appearance preferences", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-color-scheme");
    document.head
      .querySelectorAll('[data-test-theme-meta="true"]')
      .forEach((element) => element.remove());
  });

  it("loads only supported device-local choices", () => {
    const storage = {
      getItem: () => "dark",
      setItem: () => undefined,
    };
    expect(loadAppearancePreference(storage)).toBe("dark");
    expect(
      loadAppearancePreference({ ...storage, getItem: () => "sepia" }),
    ).toBe("auto");
  });

  it("persists the selected choice", () => {
    const values = new Map<string, string>();
    saveAppearancePreference("light", {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    expect(values.get(APPEARANCE_PREFERENCE_KEY)).toBe("light");
  });

  it("applies explicit schemes and restores automatic metadata", () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta name="theme-color" data-scheme="dark" data-test-theme-meta="true"><meta name="theme-color" data-scheme="light" data-test-theme-meta="true">',
    );
    const dark = document.querySelector<HTMLMetaElement>(
      'meta[data-scheme="dark"]',
    );
    const light = document.querySelector<HTMLMetaElement>(
      'meta[data-scheme="light"]',
    );

    applyAppearancePreference("light");
    expect(document.documentElement).toHaveAttribute(
      "data-color-scheme",
      "light",
    );
    expect(dark).toHaveAttribute("media", "not all");
    expect(light).toHaveAttribute("media", "all");

    applyAppearancePreference("auto");
    expect(document.documentElement).not.toHaveAttribute("data-color-scheme");
    expect(dark).toHaveAttribute("media", "(prefers-color-scheme: dark)");
    expect(light).toHaveAttribute("media", "(prefers-color-scheme: light)");
  });
});
