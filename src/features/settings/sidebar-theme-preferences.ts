import type { CSSProperties } from "react";
import type { AppSpace } from "../server/app-space";

const CHROME_THEME_KEY_PREFIX = "bakbak.chromeThemes.v2";
const LEGACY_SIDEBAR_THEME_KEY_PREFIX = "bakbak.sidebarThemes.v1";

export type ChromeThemeMode = "glass" | "gradient";
export type ChromeThemeTexture = "none" | "dots" | "grain";

export const MIN_CHROME_THEME_TRANSPARENCY = 20;
export const MAX_CHROME_THEME_TRANSPARENCY = 100;
export const DEFAULT_CHROME_THEME_TRANSPARENCY = 100;
const PREVIOUS_DEFAULT_CHROME_THEME_TRANSPARENCY = 45;

export interface ChromeThemePoint {
  x: number;
  y: number;
}

export interface SpaceChromeTheme {
  mode: ChromeThemeMode;
  colors: [string, string, string];
  points: [ChromeThemePoint, ChromeThemePoint, ChromeThemePoint];
  brightness: number;
  transparency: number;
  texture: ChromeThemeTexture;
}

export interface ChromeThemePreferences {
  spaces: Record<AppSpace, SpaceChromeTheme>;
}

// Keep the existing names while App and the settings surface adopt the broader
// chrome terminology. These aliases deliberately describe the same v2 shape.
export type SidebarThemeMode = ChromeThemeMode;
export type SidebarThemeTexture = ChromeThemeTexture;
export type SidebarThemePoint = ChromeThemePoint;
export type SpaceSidebarTheme = SpaceChromeTheme;
export type SidebarThemePreferences = ChromeThemePreferences;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LEGACY_DEFAULT_SPACE_THEMES: Record<AppSpace, SpaceChromeTheme> = {
  server: {
    mode: "gradient",
    colors: ["#5d4c31", "#24504d", "#0d1727"],
    points: [
      { x: 22, y: 24 },
      { x: 55, y: 50 },
      { x: 80, y: 78 },
    ],
    brightness: 0,
    transparency: 0,
    texture: "none",
  },
  personal: {
    mode: "gradient",
    colors: ["#512f43", "#44385e", "#0d1727"],
    points: [
      { x: 25, y: 22 },
      { x: 57, y: 49 },
      { x: 78, y: 80 },
    ],
    brightness: 0,
    transparency: 0,
    texture: "none",
  },
};

export const DEFAULT_CHROME_THEME_PREFERENCES: ChromeThemePreferences = {
  spaces: {
    server: {
      ...structuredClone(LEGACY_DEFAULT_SPACE_THEMES.server),
      mode: "glass",
      transparency: DEFAULT_CHROME_THEME_TRANSPARENCY,
    },
    personal: {
      ...structuredClone(LEGACY_DEFAULT_SPACE_THEMES.personal),
      mode: "glass",
      transparency: DEFAULT_CHROME_THEME_TRANSPARENCY,
    },
  },
};

export const DEFAULT_SIDEBAR_THEME_PREFERENCES =
  DEFAULT_CHROME_THEME_PREFERENCES;

export type ChromeThemeStyle = CSSProperties & {
  "--space-gradient": string;
};
export type SidebarThemeStyle = ChromeThemeStyle;

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function chromeThemeStorageKey(userId: string): string {
  return `${CHROME_THEME_KEY_PREFIX}:${userId}`;
}

export const sidebarThemeStorageKey = chromeThemeStorageKey;

function legacySidebarThemeStorageKey(userId: string): string {
  return `${LEGACY_SIDEBAR_THEME_KEY_PREFIX}:${userId}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function readSpaceTheme(
  value: unknown,
  fallback: SpaceChromeTheme,
  allowGlass = true,
  minimumTransparency = MIN_CHROME_THEME_TRANSPARENCY,
): SpaceChromeTheme {
  if (!value || typeof value !== "object") return structuredClone(fallback);
  const candidate = value as Partial<Omit<SpaceChromeTheme, "mode">> & {
    mode?: unknown;
  };
  const colors = Array.isArray(candidate.colors)
    ? candidate.colors.filter(isHexColor).slice(0, 3)
    : [];
  const points = Array.isArray(candidate.points)
    ? candidate.points.slice(0, 3).map((point) => {
        if (!point || typeof point !== "object") return null;
        const candidatePoint = point as Partial<ChromeThemePoint>;
        if (
          typeof candidatePoint.x !== "number" ||
          typeof candidatePoint.y !== "number"
        ) {
          return null;
        }
        return {
          x: clamp(candidatePoint.x, 8, 92),
          y: clamp(candidatePoint.y, 8, 92),
        };
      })
    : [];
  const parsedColors: [string, string, string] =
    colors.length === 3
      ? ([colors[0], colors[1], colors[2]] as [string, string, string])
      : [...fallback.colors];
  const legacySolid = candidate.mode === "solid";
  return {
    mode:
      candidate.mode === "gradient" ||
      (allowGlass && candidate.mode === "glass")
        ? candidate.mode
        : legacySolid
          ? "gradient"
          : fallback.mode,
    colors: legacySolid
      ? ([parsedColors[0], parsedColors[0], parsedColors[0]] as [
          string,
          string,
          string,
        ])
      : parsedColors,
    points:
      points.length === 3 && points.every((point) => point !== null)
        ? (points as [ChromeThemePoint, ChromeThemePoint, ChromeThemePoint])
        : structuredClone(fallback.points),
    brightness:
      typeof candidate.brightness === "number"
        ? clamp(candidate.brightness, -35, 35)
        : fallback.brightness,
    transparency:
      typeof candidate.transparency === "number" &&
      Number.isFinite(candidate.transparency)
        ? clamp(
            candidate.transparency,
            minimumTransparency,
            MAX_CHROME_THEME_TRANSPARENCY,
          )
        : fallback.transparency,
    texture:
      candidate.texture === "dots" || candidate.texture === "grain"
        ? candidate.texture
        : "none",
  };
}

function themesMatch(
  first: SpaceChromeTheme,
  second: SpaceChromeTheme,
): boolean {
  return (
    first.mode === second.mode &&
    first.brightness === second.brightness &&
    first.transparency === second.transparency &&
    first.texture === second.texture &&
    first.colors.every((color, index) => color === second.colors[index]) &&
    first.points.every(
      (point, index) =>
        point.x === second.points[index]?.x &&
        point.y === second.points[index]?.y,
    )
  );
}

function readCurrentSpaceTheme(
  value: unknown,
  space: AppSpace,
): SpaceChromeTheme {
  const fallback = DEFAULT_CHROME_THEME_PREFERENCES.spaces[space];
  const parsed = readSpaceTheme(value, fallback);
  const previousDefault = {
    ...structuredClone(fallback),
    transparency: PREVIOUS_DEFAULT_CHROME_THEME_TRANSPARENCY,
  };
  return themesMatch(parsed, previousDefault)
    ? { ...parsed, transparency: DEFAULT_CHROME_THEME_TRANSPARENCY }
    : parsed;
}

export function readChromeThemePreferences(
  value: unknown,
): ChromeThemePreferences {
  if (!value || typeof value !== "object") {
    return structuredClone(DEFAULT_CHROME_THEME_PREFERENCES);
  }
  const candidate = value as Partial<ChromeThemePreferences>;
  const spaces =
    candidate.spaces && typeof candidate.spaces === "object"
      ? candidate.spaces
      : undefined;
  return {
    spaces: {
      server: readCurrentSpaceTheme(spaces?.server, "server"),
      personal: readCurrentSpaceTheme(spaces?.personal, "personal"),
    },
  };
}

export const readSidebarThemePreferences = readChromeThemePreferences;

function migrateLegacySpaceTheme(
  value: unknown,
  space: AppSpace,
): SpaceChromeTheme {
  const legacyDefault = LEGACY_DEFAULT_SPACE_THEMES[space];
  const parsed = readSpaceTheme(value, legacyDefault, false, 0);
  const isLegacyDefault = themesMatch(parsed, legacyDefault);
  return {
    ...parsed,
    mode: isLegacyDefault ? "glass" : parsed.mode,
    transparency: isLegacyDefault
      ? DEFAULT_CHROME_THEME_TRANSPARENCY
      : clamp(
          parsed.transparency,
          MIN_CHROME_THEME_TRANSPARENCY,
          MAX_CHROME_THEME_TRANSPARENCY,
        ),
  };
}

function migrateLegacyPreferences(value: unknown): ChromeThemePreferences {
  if (!value || typeof value !== "object") {
    return structuredClone(DEFAULT_CHROME_THEME_PREFERENCES);
  }
  const candidate = value as { spaces?: unknown };
  const spaces =
    candidate.spaces && typeof candidate.spaces === "object"
      ? (candidate.spaces as Partial<Record<AppSpace, unknown>>)
      : undefined;
  return {
    spaces: {
      server: migrateLegacySpaceTheme(spaces?.server, "server"),
      personal: migrateLegacySpaceTheme(spaces?.personal, "personal"),
    },
  };
}

export function loadChromeThemePreferences(
  userId: string,
  storage: StorageLike | undefined = browserStorage(),
): ChromeThemePreferences {
  if (!storage) return structuredClone(DEFAULT_CHROME_THEME_PREFERENCES);
  try {
    const current = storage.getItem(chromeThemeStorageKey(userId));
    if (current !== null) {
      const currentValue = JSON.parse(current) as unknown;
      const normalized = readChromeThemePreferences(currentValue);
      if (JSON.stringify(currentValue) !== JSON.stringify(normalized)) {
        saveChromeThemePreferences(userId, normalized, storage);
      }
      return normalized;
    }

    const legacy = storage.getItem(legacySidebarThemeStorageKey(userId));
    if (legacy === null) {
      return structuredClone(DEFAULT_CHROME_THEME_PREFERENCES);
    }

    let migrated: ChromeThemePreferences;
    try {
      migrated = migrateLegacyPreferences(JSON.parse(legacy));
    } catch {
      migrated = structuredClone(DEFAULT_CHROME_THEME_PREFERENCES);
    }
    saveChromeThemePreferences(userId, migrated, storage);
    return migrated;
  } catch {
    return structuredClone(DEFAULT_CHROME_THEME_PREFERENCES);
  }
}

export const loadSidebarThemePreferences = loadChromeThemePreferences;

export function saveChromeThemePreferences(
  userId: string,
  preferences: ChromeThemePreferences,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(
      chromeThemeStorageKey(userId),
      JSON.stringify(preferences),
    );
  } catch {
    // The theme still applies for this session if storage is unavailable.
  }
}

export const saveSidebarThemePreferences = saveChromeThemePreferences;

function adjustedChannel(channel: number, brightness: number): number {
  const target = brightness < 0 ? 0 : 255;
  const amount = Math.abs(brightness) / 100;
  return Math.round(channel + (target - channel) * amount);
}

function colorWithAdjustments(
  color: string,
  brightness: number,
  transparency: number,
): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const alpha = Number(((100 - transparency) / 100).toFixed(2));
  return `rgba(${adjustedChannel(red, brightness)}, ${adjustedChannel(green, brightness)}, ${adjustedChannel(blue, brightness)}, ${alpha})`;
}

export function chromeThemeStyle(theme: SpaceChromeTheme): ChromeThemeStyle {
  if (theme.mode === "glass") {
    const tintStrength = 100 - theme.transparency;
    const tint = `color-mix(in srgb, var(--conversation-canvas) ${tintStrength}%, transparent)`;
    return { "--space-gradient": `linear-gradient(${tint}, ${tint})` };
  }

  const colors = theme.colors.map((color) =>
    colorWithAdjustments(color, theme.brightness, theme.transparency),
  );
  const first = theme.points[0];
  const middle = theme.points[1];
  const last = theme.points[2];
  const deltaX = last.x - first.x;
  const deltaY = last.y - first.y;
  const lengthSquared = Math.max(deltaX * deltaX + deltaY * deltaY, 1);
  const middleProjection =
    ((middle.x - first.x) * deltaX + (middle.y - first.y) * deltaY) /
    lengthSquared;
  const middleStop = clamp(middleProjection * 100, 18, 82);
  const angle = Math.round(
    ((Math.atan2(deltaX, -deltaY) * 180) / Math.PI + 360) % 360,
  );
  const gradient = `linear-gradient(${angle}deg, ${colors[0]} 0%, ${colors[1]} ${middleStop}%, ${colors[2]} 100%)`;
  return { "--space-gradient": gradient };
}

export const sidebarThemeStyle = chromeThemeStyle;

export function resetSpaceChromeTheme(space: AppSpace): SpaceChromeTheme {
  return structuredClone(DEFAULT_CHROME_THEME_PREFERENCES.spaces[space]);
}

export const resetSpaceSidebarTheme = resetSpaceChromeTheme;
