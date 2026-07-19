export const LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v2";
export const LEGACY_LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v1";
export const DEFAULT_CONTEXT_PANEL_WIDTH = 232;
export const DEFAULT_RIGHT_PANEL_WIDTH = 240;
export const MIN_SIDE_PANEL_WIDTH = 200;
export const MAX_SIDE_PANEL_WIDTH = 360;
export const MIN_CONTENT_WIDTH = 420;
export const DESTINATION_RAIL_WIDTH = 68;

export interface LayoutPreferences {
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  contextPanelWidth: number;
  rightPanelWidth: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
  leftPanelVisible: true,
  rightPanelVisible: true,
  contextPanelWidth: DEFAULT_CONTEXT_PANEL_WIDTH,
  rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
};

export function clampPanelWidth(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIDE_PANEL_WIDTH;
  return Math.max(
    MIN_SIDE_PANEL_WIDTH,
    Math.min(MAX_SIDE_PANEL_WIDTH, Math.round(value)),
  );
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadLayoutPreferences(
  storage: StorageLike | undefined = browserStorage(),
): LayoutPreferences {
  if (!storage) return DEFAULT_LAYOUT_PREFERENCES;
  try {
    const stored: unknown = JSON.parse(
      storage.getItem(LAYOUT_PREFERENCES_KEY) ?? "null",
    );
    if (
      stored &&
      typeof stored === "object" &&
      "leftPanelVisible" in stored &&
      "rightPanelVisible" in stored &&
      "contextPanelWidth" in stored &&
      "rightPanelWidth" in stored &&
      typeof stored.leftPanelVisible === "boolean" &&
      typeof stored.rightPanelVisible === "boolean" &&
      typeof stored.contextPanelWidth === "number" &&
      typeof stored.rightPanelWidth === "number"
    ) {
      return {
        leftPanelVisible: stored.leftPanelVisible,
        rightPanelVisible: stored.rightPanelVisible,
        contextPanelWidth: clampPanelWidth(stored.contextPanelWidth),
        rightPanelWidth: clampPanelWidth(stored.rightPanelWidth),
      };
    }

    const legacy: unknown = JSON.parse(
      storage.getItem(LEGACY_LAYOUT_PREFERENCES_KEY) ?? "null",
    );
    if (
      legacy &&
      typeof legacy === "object" &&
      "leftPanelVisible" in legacy &&
      "rightPanelVisible" in legacy &&
      typeof legacy.leftPanelVisible === "boolean" &&
      typeof legacy.rightPanelVisible === "boolean"
    ) {
      return {
        ...DEFAULT_LAYOUT_PREFERENCES,
        leftPanelVisible: legacy.leftPanelVisible,
        rightPanelVisible: legacy.rightPanelVisible,
      };
    }
  } catch {
    // A broken local preference must not keep the app from opening.
  }
  return DEFAULT_LAYOUT_PREFERENCES;
}

export function saveLayoutPreferences(
  preferences: LayoutPreferences,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(LAYOUT_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Layout still changes for this session if storage is unavailable.
  }
}
