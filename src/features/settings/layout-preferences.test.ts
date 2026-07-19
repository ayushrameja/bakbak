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

  it("shows both panels by default", () => {
    expect(loadLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });

  it("persists the panels independently", () => {
    saveLayoutPreferences({
      leftPanelVisible: false,
      rightPanelVisible: true,
      contextPanelWidth: 280,
      rightPanelWidth: 320,
    });
    expect(loadLayoutPreferences()).toEqual({
      leftPanelVisible: false,
      rightPanelVisible: true,
      contextPanelWidth: 280,
      rightPanelWidth: 320,
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

  it("migrates v1 visibility and clamps corrupt v2 widths", () => {
    window.localStorage.setItem(
      LEGACY_LAYOUT_PREFERENCES_KEY,
      JSON.stringify({
        leftPanelVisible: false,
        rightPanelVisible: true,
      }),
    );
    expect(loadLayoutPreferences()).toEqual({
      ...DEFAULT_LAYOUT_PREFERENCES,
      leftPanelVisible: false,
    });

    window.localStorage.setItem(
      LAYOUT_PREFERENCES_KEY,
      JSON.stringify({
        leftPanelVisible: true,
        rightPanelVisible: true,
        contextPanelWidth: -900,
        rightPanelWidth: 9000,
      }),
    );
    expect(loadLayoutPreferences()).toEqual({
      leftPanelVisible: true,
      rightPanelVisible: true,
      contextPanelWidth: MIN_SIDE_PANEL_WIDTH,
      rightPanelWidth: MAX_SIDE_PANEL_WIDTH,
    });
  });
});
