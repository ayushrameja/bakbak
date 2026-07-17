export const SCREEN_SHARE_PREFERENCES_KEY = "bakbak.screenSharePreferences.v1";

export const SCREEN_SHARE_RESOLUTIONS = [480, 720, 1080] as const;
export const SCREEN_SHARE_FRAME_RATES = [15, 30, 60] as const;

export type ScreenShareResolution = (typeof SCREEN_SHARE_RESOLUTIONS)[number];
export type ScreenShareFrameRate = (typeof SCREEN_SHARE_FRAME_RATES)[number];

export interface ScreenShareSettings {
  resolution: ScreenShareResolution;
  frameRate: ScreenShareFrameRate;
}

export const DEFAULT_SCREEN_SHARE_SETTINGS: ScreenShareSettings = {
  resolution: 1080,
  frameRate: 60,
};

export function loadScreenShareSettings(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): ScreenShareSettings {
  try {
    const raw = storage.getItem(SCREEN_SHARE_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_SCREEN_SHARE_SETTINGS };
    return parseScreenShareSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SCREEN_SHARE_SETTINGS };
  }
}

export function saveScreenShareSettings(
  settings: ScreenShareSettings,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  try {
    storage.setItem(
      SCREEN_SHARE_PREFERENCES_KEY,
      JSON.stringify(parseScreenShareSettings(settings)),
    );
  } catch {
    // Screen-share preferences are optional. Capture must still be usable.
  }
}

export function parseScreenShareSettings(value: unknown): ScreenShareSettings {
  if (!isRecord(value)) return { ...DEFAULT_SCREEN_SHARE_SETTINGS };
  return {
    resolution: isResolution(value.resolution)
      ? value.resolution
      : DEFAULT_SCREEN_SHARE_SETTINGS.resolution,
    frameRate: isFrameRate(value.frameRate)
      ? value.frameRate
      : DEFAULT_SCREEN_SHARE_SETTINGS.frameRate,
  };
}

export function screenShareBitrate(settings: ScreenShareSettings): number {
  const bitrateByProfile: Record<
    ScreenShareResolution,
    Record<ScreenShareFrameRate, number>
  > = {
    480: { 15: 800_000, 30: 1_500_000, 60: 2_500_000 },
    720: { 15: 1_500_000, 30: 2_000_000, 60: 4_000_000 },
    1080: { 15: 2_500_000, 30: 5_000_000, 60: 8_000_000 },
  };
  return bitrateByProfile[settings.resolution][settings.frameRate];
}

function isResolution(value: unknown): value is ScreenShareResolution {
  return SCREEN_SHARE_RESOLUTIONS.some((candidate) => candidate === value);
}

function isFrameRate(value: unknown): value is ScreenShareFrameRate {
  return SCREEN_SHARE_FRAME_RATES.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
