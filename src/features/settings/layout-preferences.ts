export const LAYOUT_PREFERENCES_KEY = "bakbak.layoutPreferences.v1";

export interface LayoutPreferences {
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
  leftPanelVisible: true,
  rightPanelVisible: true,
};

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
      typeof stored.leftPanelVisible === "boolean" &&
      typeof stored.rightPanelVisible === "boolean"
    ) {
      return {
        leftPanelVisible: stored.leftPanelVisible,
        rightPanelVisible: stored.rightPanelVisible,
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
