import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_PREFERENCES,
  LAYOUT_PREFERENCES_KEY,
  loadLayoutPreferences,
  saveLayoutPreferences,
} from "./layout-preferences";

describe("layout preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows both panels by default", () => {
    expect(loadLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });

  it("persists the panels independently", () => {
    saveLayoutPreferences({
      leftPanelVisible: false,
      rightPanelVisible: true,
    });
    expect(loadLayoutPreferences()).toEqual({
      leftPanelVisible: false,
      rightPanelVisible: true,
    });
  });

  it("falls back safely for malformed or incomplete data", () => {
    window.localStorage.setItem(LAYOUT_PREFERENCES_KEY, "not-json");
    expect(loadLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);

    window.localStorage.setItem(
      LAYOUT_PREFERENCES_KEY,
      JSON.stringify({ leftPanelVisible: false }),
    );
    expect(loadLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });
});
