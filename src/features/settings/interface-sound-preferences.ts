export const INTERFACE_SOUND_PREFERENCES_KEY =
  "bakbak.interfaceSoundPreferences.v1";

export type InterfaceSoundCategory =
  "messages" | "voice" | "screen-share" | "status";

export interface InterfaceSoundPreferences {
  enabled: boolean;
  volume: number;
  categories: Record<InterfaceSoundCategory, boolean>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_INTERFACE_SOUND_PREFERENCES: InterfaceSoundPreferences = {
  enabled: true,
  volume: 0.55,
  categories: {
    messages: true,
    voice: true,
    "screen-share": true,
    status: true,
  },
};

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isVolume(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

export function loadInterfaceSoundPreferences(
  storage: StorageLike | undefined = browserStorage(),
): InterfaceSoundPreferences {
  if (!storage) return DEFAULT_INTERFACE_SOUND_PREFERENCES;
  try {
    const value = JSON.parse(
      storage.getItem(INTERFACE_SOUND_PREFERENCES_KEY) ?? "null",
    ) as unknown;
    if (
      !value ||
      typeof value !== "object" ||
      !("enabled" in value) ||
      !("volume" in value) ||
      !("categories" in value) ||
      typeof value.enabled !== "boolean" ||
      !isVolume(value.volume) ||
      !value.categories ||
      typeof value.categories !== "object"
    ) {
      return DEFAULT_INTERFACE_SOUND_PREFERENCES;
    }
    const categories = value.categories;
    if (
      !("messages" in categories) ||
      !("voice" in categories) ||
      !("screen-share" in categories) ||
      !("status" in categories) ||
      typeof categories.messages !== "boolean" ||
      typeof categories.voice !== "boolean" ||
      typeof categories["screen-share"] !== "boolean" ||
      typeof categories.status !== "boolean"
    ) {
      return DEFAULT_INTERFACE_SOUND_PREFERENCES;
    }
    return {
      enabled: value.enabled,
      volume: value.volume,
      categories: {
        messages: categories.messages,
        voice: categories.voice,
        "screen-share": categories["screen-share"],
        status: categories.status,
      },
    };
  } catch {
    return DEFAULT_INTERFACE_SOUND_PREFERENCES;
  }
}

export function saveInterfaceSoundPreferences(
  preferences: InterfaceSoundPreferences,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(
      INTERFACE_SOUND_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Device-local sound choices are optional enhancement state.
  }
}
