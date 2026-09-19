import type { SoundboardActivity } from "./types";

export function keepLatestSoundboardActivity(
  activities: SoundboardActivity[],
): SoundboardActivity[] {
  return activities.slice(-1);
}
