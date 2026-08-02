import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_PREFERENCES,
  LEGACY_LAYOUT_PREFERENCES_KEY,
  LAYOUT_PREFERENCES_KEY,
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  loadLayoutPreferences,
  saveLayoutPreferences,
} from "./layout-preferences";

describe("layout preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows the 280px sidebar by default", () => {
    expect(loadLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });

  it("persists sidebar visibility and width", () => {
    saveLayoutPreferences({
      leftPanelVisible: false,
      contextPanelWidth: 280,
    });
    expect(loadLayoutPreferences()).toEqual({
      leftPanelVisible: false,
      contextPanelWidth: 280,
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

  it("migrates v2 left settings and discards right-panel fields", () => {
    window.localStorage.setItem(
      LEGACY_LAYOUT_PREFERENCES_KEY,
      JSON.stringify({
        leftPanelVisible: false,
        rightPanelVisible: true,
        contextPanelWidth: 320,
        rightPanelWidth: 9000,
      }),
    );
    expect(loadLayoutPreferences()).toEqual({
      leftPanelVisible: false,
      contextPanelWidth: 320,
    });

    window.localStorage.setItem(
      LAYOUT_PREFERENCES_KEY,
      JSON.stringify({
        leftPanelVisible: true,
        contextPanelWidth: -900,
      }),
    );
    expect(loadLayoutPreferences()).toEqual({
      leftPanelVisible: true,
      contextPanelWidth: MIN_SIDE_PANEL_WIDTH,
    });
    expect(MAX_SIDE_PANEL_WIDTH).toBe(340);
  });
});
