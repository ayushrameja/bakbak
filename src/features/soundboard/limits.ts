import type { SoundboardActivity } from "./types";

export const MAX_CONCURRENT_SOUNDS_PER_USER = 5;

export function hasReachedSoundLimit(activeSoundCount: number): boolean {
  return activeSoundCount >= MAX_CONCURRENT_SOUNDS_PER_USER;
}

export function clampSoundboardActivities(
  activities: SoundboardActivity[],
): SoundboardActivity[] {
  return activities.slice(-MAX_CONCURRENT_SOUNDS_PER_USER);
}
