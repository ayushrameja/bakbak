import type { CSSProperties } from "react";
import type { AppSpace } from "../server/app-space";

const SIDEBAR_THEME_KEY_PREFIX = "bakbak.sidebarThemes.v1";

export type SidebarThemeMode = "solid" | "gradient";
export type SidebarThemeTexture = "none" | "dots" | "grain";

export interface SidebarThemePoint {
  x: number;
  y: number;
}

export interface SpaceSidebarTheme {
  mode: SidebarThemeMode;
  colors: [string, string, string];
  points: [SidebarThemePoint, SidebarThemePoint, SidebarThemePoint];
  brightness: number;
  transparency: number;
  texture: SidebarThemeTexture;
}

export interface SidebarThemePreferences {
  onboardingComplete: boolean;
  spaces: Record<AppSpace, SpaceSidebarTheme>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_SIDEBAR_THEME_PREFERENCES: SidebarThemePreferences = {
  onboardingComplete: false,
  spaces: {
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
  },
};

export type SidebarThemeStyle = CSSProperties & {
  "--space-gradient": string;
};

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function sidebarThemeStorageKey(userId: string): string {
  return `${SIDEBAR_THEME_KEY_PREFIX}:${userId}`;
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
  fallback: SpaceSidebarTheme,
): SpaceSidebarTheme {
  if (!value || typeof value !== "object") return { ...fallback };
  const candidate = value as Partial<SpaceSidebarTheme>;
  const colors = Array.isArray(candidate.colors)
    ? candidate.colors.filter(isHexColor).slice(0, 3)
    : [];
  const points = Array.isArray(candidate.points)
    ? candidate.points.slice(0, 3).map((point) => {
        if (!point || typeof point !== "object") return null;
        const candidatePoint = point as Partial<SidebarThemePoint>;
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
  return {
    mode:
      candidate.mode === "solid" || candidate.mode === "gradient"
        ? candidate.mode
        : fallback.mode,
    colors:
      colors.length === 3
        ? ([colors[0], colors[1], colors[2]] as [string, string, string])
        : [...fallback.colors],
    points:
      points.length === 3 && points.every((point) => point !== null)
        ? (points as [
            SidebarThemePoint,
            SidebarThemePoint,
            SidebarThemePoint,
          ])
        : structuredClone(fallback.points),
    brightness:
      typeof candidate.brightness === "number"
        ? clamp(candidate.brightness, -35, 35)
        : fallback.brightness,
    transparency:
      typeof candidate.transparency === "number"
        ? clamp(candidate.transparency, 0, 45)
        : fallback.transparency,
    texture:
      candidate.texture === "dots" || candidate.texture === "grain"
        ? candidate.texture
        : "none",
  };
}

export function readSidebarThemePreferences(
  value: unknown,
): SidebarThemePreferences {
  if (!value || typeof value !== "object") {
    return structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES);
  }
  const candidate = value as Partial<SidebarThemePreferences>;
  const spaces =
    candidate.spaces && typeof candidate.spaces === "object"
      ? candidate.spaces
      : undefined;
  return {
    onboardingComplete: candidate.onboardingComplete === true,
    spaces: {
      server: readSpaceTheme(
        spaces?.server,
        DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server,
      ),
      personal: readSpaceTheme(
        spaces?.personal,
        DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal,
      ),
    },
  };
}

export function loadSidebarThemePreferences(
  userId: string,
  storage: StorageLike | undefined = browserStorage(),
): SidebarThemePreferences {
  if (!storage) return structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES);
  try {
    return readSidebarThemePreferences(
      JSON.parse(storage.getItem(sidebarThemeStorageKey(userId)) ?? "null"),
    );
  } catch {
    return structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES);
  }
}

export function saveSidebarThemePreferences(
  userId: string,
  preferences: SidebarThemePreferences,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(
      sidebarThemeStorageKey(userId),
      JSON.stringify(preferences),
    );
  } catch {
    // The theme still applies for this session if storage is unavailable.
  }
}

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

export function sidebarThemeStyle(theme: SpaceSidebarTheme): SidebarThemeStyle {
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
  const gradient =
    theme.mode === "solid"
      ? `linear-gradient(${colors[0]}, ${colors[0]})`
      : `linear-gradient(${angle}deg, ${colors[0]} 0%, ${colors[1]} ${middleStop}%, ${colors[2]} 100%)`;
  return { "--space-gradient": gradient };
}

export function resetSpaceSidebarTheme(space: AppSpace): SpaceSidebarTheme {
  return structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces[space]);
}
