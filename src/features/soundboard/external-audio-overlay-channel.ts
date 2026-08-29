import type { SoundAssetStatus } from "./types";

export const EXTERNAL_AUDIO_OVERLAY_CHANNEL = "bakbak:external-soundboard:v1";

export interface ExternalAudioOverlaySound {
  id: string;
  label: string;
  emoji: string;
  favorite: boolean;
  assetStatus: SoundAssetStatus;
}

export interface ExternalAudioOverlayCatalog {
  type: "catalog";
  sounds: ExternalAudioOverlaySound[];
  recentSoundIds: string[];
}

export type ExternalAudioOverlayMessage =
  | { type: "ready" }
  | { type: "play"; soundId: string }
  | { type: "stop-sound" }
  | ExternalAudioOverlayCatalog
  | { type: "play-error"; message: string };

export function parseExternalAudioOverlayMessage(
  value: unknown,
): ExternalAudioOverlayMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "ready") return { type: "ready" };
  if (candidate.type === "stop-sound") return { type: "stop-sound" };
  if (
    candidate.type === "play" &&
    typeof candidate.soundId === "string" &&
    candidate.soundId.length > 0 &&
    candidate.soundId.length <= 128
  ) {
    return { type: "play", soundId: candidate.soundId };
  }
  if (
    candidate.type === "play-error" &&
    typeof candidate.message === "string" &&
    candidate.message.length <= 500
  ) {
    return { type: "play-error", message: candidate.message };
  }
  if (candidate.type !== "catalog" || !Array.isArray(candidate.sounds)) {
    return null;
  }
  const sounds = candidate.sounds.flatMap((sound) => {
    if (!sound || typeof sound !== "object") return [];
    const item = sound as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      typeof item.emoji !== "string" ||
      typeof item.favorite !== "boolean" ||
      !["loading", "ready", "error"].includes(String(item.assetStatus))
    ) {
      return [];
    }
    return [
      {
        id: item.id.slice(0, 128),
        label: item.label.slice(0, 80),
        emoji: item.emoji.slice(0, 16),
        favorite: item.favorite,
        assetStatus: item.assetStatus as SoundAssetStatus,
      },
    ];
  });
  const recentSoundIds = Array.isArray(candidate.recentSoundIds)
    ? candidate.recentSoundIds
        .filter((id): id is string => typeof id === "string")
        .slice(0, 12)
    : [];
  return { type: "catalog", sounds, recentSoundIds };
}
