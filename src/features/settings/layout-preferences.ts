export const LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v3";
export const LEGACY_LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v2";
const LEGACY_V1_LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v1";

export const DEFAULT_CONTEXT_PANEL_WIDTH = 280;
export const MIN_SIDE_PANEL_WIDTH = 248;
export const MAX_SIDE_PANEL_WIDTH = 340;
export const MIN_CONTENT_WIDTH = 420;

export interface LayoutPreferencesV3 {
  leftPanelVisible: boolean;
  contextPanelWidth: number;
}

export type LayoutPreferences = LayoutPreferencesV3;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferencesV3 = {
  leftPanelVisible: true,
  contextPanelWidth: DEFAULT_CONTEXT_PANEL_WIDTH,
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

function isStoredV3(value: unknown): value is LayoutPreferencesV3 {
  return Boolean(
    value &&
    typeof value === "object" &&
    "leftPanelVisible" in value &&
    "contextPanelWidth" in value &&
    typeof value.leftPanelVisible === "boolean" &&
    typeof value.contextPanelWidth === "number",
  );
}

export function loadLayoutPreferences(
  storage: StorageLike | undefined = browserStorage(),
): LayoutPreferencesV3 {
  if (!storage) return DEFAULT_LAYOUT_PREFERENCES;

  try {
    const stored: unknown = JSON.parse(
      storage.getItem(LAYOUT_PREFERENCES_KEY) ?? "null",
    );
    if (isStoredV3(stored)) {
      return {
        leftPanelVisible: stored.leftPanelVisible,
        contextPanelWidth: clampPanelWidth(stored.contextPanelWidth),
      };
    }
  } catch {
    // Continue with legacy migration.
  }

  try {
    const legacy: unknown = JSON.parse(
      storage.getItem(LEGACY_LAYOUT_PREFERENCES_KEY) ?? "null",
    );
    if (isStoredV3(legacy)) {
      const migrated = {
        leftPanelVisible: legacy.leftPanelVisible,
        contextPanelWidth: clampPanelWidth(legacy.contextPanelWidth),
      };
      storage.setItem(LAYOUT_PREFERENCES_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Continue with the original visibility-only migration.
  }

  try {
    const legacy: unknown = JSON.parse(
      storage.getItem(LEGACY_V1_LAYOUT_PREFERENCES_KEY) ?? "null",
    );
    if (
      legacy &&
      typeof legacy === "object" &&
      "leftPanelVisible" in legacy &&
      typeof legacy.leftPanelVisible === "boolean"
    ) {
      return {
        ...DEFAULT_LAYOUT_PREFERENCES,
        leftPanelVisible: legacy.leftPanelVisible,
      };
    }
  } catch {
    // A broken local preference must not keep the app from opening.
  }

  return DEFAULT_LAYOUT_PREFERENCES;
}

export function saveLayoutPreferences(
  preferences: LayoutPreferencesV3,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(LAYOUT_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Layout still changes for this session if storage is unavailable.
  }
}
