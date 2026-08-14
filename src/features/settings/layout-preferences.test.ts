import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_PREFERENCES,
  DEFAULT_SIDEBAR_WIDTH,
  LEGACY_LAYOUT_PREFERENCES_KEY,
  LEGACY_V3_LAYOUT_PREFERENCES_KEY,
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

  it("persists normalized sidebar visibility and width", () => {
    saveLayoutPreferences({
      sidebarVisible: false,
      sidebarWidth: 9000,
    });
    expect(loadLayoutPreferences()).toEqual({
      sidebarVisible: false,
      sidebarWidth: MAX_SIDE_PANEL_WIDTH,
    });
  });

  it("falls back safely for malformed or incomplete data", () => {
    window.localStorage.setItem(LAYOUT_PREFERENCES_KEY, "not-json");
    expect(loadLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);

    window.localStorage.setItem(
      LAYOUT_PREFERENCES_KEY,
      JSON.stringify({ sidebarVisible: false }),
    );
    expect(loadLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });

  it("migrates v3 sidebar state into the renamed v4 contract", () => {
    window.localStorage.setItem(
      LEGACY_V3_LAYOUT_PREFERENCES_KEY,
      JSON.stringify({
        leftPanelVisible: false,
        contextPanelWidth: 320,
      }),
    );

    expect(loadLayoutPreferences()).toEqual({
      sidebarVisible: false,
      sidebarWidth: 320,
    });
    expect(
      JSON.parse(window.localStorage.getItem(LAYOUT_PREFERENCES_KEY) ?? "null"),
    ).toEqual({ sidebarVisible: false, sidebarWidth: 320 });
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
      sidebarVisible: false,
      sidebarWidth: 320,
    });
  });

  it("migrates the original visibility-only preference with the default width", () => {
    window.localStorage.setItem(
      "bakbak.layoutPreferences.v1",
      JSON.stringify({ leftPanelVisible: false }),
    );

    expect(loadLayoutPreferences()).toEqual({
      sidebarVisible: false,
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    });
  });

  it("clamps stored v4 widths and keeps v4 ahead of legacy values", () => {
    window.localStorage.setItem(
      LEGACY_V3_LAYOUT_PREFERENCES_KEY,
      JSON.stringify({ leftPanelVisible: false, contextPanelWidth: 320 }),
    );
    window.localStorage.setItem(
      LAYOUT_PREFERENCES_KEY,
      JSON.stringify({
        sidebarVisible: true,
        sidebarWidth: -900,
      }),
    );
    expect(loadLayoutPreferences()).toEqual({
      sidebarVisible: true,
      sidebarWidth: MIN_SIDE_PANEL_WIDTH,
    });
    expect(MAX_SIDE_PANEL_WIDTH).toBe(340);
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(280);
  });
});
