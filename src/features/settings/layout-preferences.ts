export const LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v5";
export const LEGACY_V4_LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v4";
export const LEGACY_V3_LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v3";
export const LEGACY_LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v2";
const LEGACY_V1_LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v1";

export const DEFAULT_SIDEBAR_WIDTH = 280;
export const MIN_SIDE_PANEL_WIDTH = 248;
export const MAX_SIDE_PANEL_WIDTH = 340;
export const MIN_CONTENT_WIDTH = 420;

export type SidebarPosition = "left" | "right";

export interface LayoutPreferencesV5 {
  sidebarVisible: boolean;
  sidebarWidth: number;
  sidebarPosition: SidebarPosition;
}

export type LayoutPreferences = LayoutPreferencesV5;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferencesV5 = {
  sidebarVisible: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarPosition: "left",
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

function isSidebarPosition(value: unknown): value is SidebarPosition {
  return value === "left" || value === "right";
}

function isStoredV5(value: unknown): value is LayoutPreferencesV5 {
  return Boolean(
    value &&
    typeof value === "object" &&
    "sidebarVisible" in value &&
    "sidebarWidth" in value &&
    "sidebarPosition" in value &&
    typeof value.sidebarVisible === "boolean" &&
    typeof value.sidebarWidth === "number" &&
    isSidebarPosition(value.sidebarPosition),
  );
}

interface LayoutPreferencesV4 {
  sidebarVisible: boolean;
  sidebarWidth: number;
}

function isStoredV4(value: unknown): value is LayoutPreferencesV4 {
  return Boolean(
    value &&
    typeof value === "object" &&
    "sidebarVisible" in value &&
    "sidebarWidth" in value &&
    typeof value.sidebarVisible === "boolean" &&
    typeof value.sidebarWidth === "number",
  );
}

interface LegacyPanelPreferences {
  leftPanelVisible: boolean;
  contextPanelWidth: number;
}

function isLegacyPanelPreferences(
  value: unknown,
): value is LegacyPanelPreferences {
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
): LayoutPreferencesV5 {
  if (!storage) return DEFAULT_LAYOUT_PREFERENCES;

  try {
    const stored: unknown = JSON.parse(
      storage.getItem(LAYOUT_PREFERENCES_KEY) ?? "null",
    );
    if (isStoredV5(stored)) {
      return {
        sidebarVisible: stored.sidebarVisible,
        sidebarWidth: clampPanelWidth(stored.sidebarWidth),
        sidebarPosition: stored.sidebarPosition,
      };
    }
  } catch {
    // Continue with legacy migration.
  }

  try {
    const legacy: unknown = JSON.parse(
      storage.getItem(LEGACY_V4_LAYOUT_PREFERENCES_KEY) ?? "null",
    );
    if (isStoredV4(legacy)) {
      const migrated = {
        sidebarVisible: legacy.sidebarVisible,
        sidebarWidth: clampPanelWidth(legacy.sidebarWidth),
        sidebarPosition: "left" as const,
      };
      storage.setItem(LAYOUT_PREFERENCES_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Continue with older migrations.
  }

  for (const legacyKey of [
    LEGACY_V3_LAYOUT_PREFERENCES_KEY,
    LEGACY_LAYOUT_PREFERENCES_KEY,
  ]) {
    try {
      const legacy: unknown = JSON.parse(storage.getItem(legacyKey) ?? "null");
      if (isLegacyPanelPreferences(legacy)) {
        const migrated = {
          sidebarVisible: legacy.leftPanelVisible,
          sidebarWidth: clampPanelWidth(legacy.contextPanelWidth),
          sidebarPosition: "left" as const,
        };
        storage.setItem(LAYOUT_PREFERENCES_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch {
      // Continue with the next legacy format.
    }
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
      const migrated = {
        ...DEFAULT_LAYOUT_PREFERENCES,
        sidebarVisible: legacy.leftPanelVisible,
      };
      storage.setItem(LAYOUT_PREFERENCES_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // A broken local preference must not keep the app from opening.
  }

  return DEFAULT_LAYOUT_PREFERENCES;
}

export function saveLayoutPreferences(
  preferences: LayoutPreferencesV5,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      LAYOUT_PREFERENCES_KEY,
      JSON.stringify({
        sidebarVisible: preferences.sidebarVisible,
        sidebarWidth: clampPanelWidth(preferences.sidebarWidth),
        sidebarPosition: preferences.sidebarPosition,
      } satisfies LayoutPreferencesV5),
    );
  } catch {
    // Layout still changes for this session if storage is unavailable.
  }
}
