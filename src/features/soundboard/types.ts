export type SoundAssetStatus = "loading" | "ready" | "error";

export interface SoundboardCategory {
  id: string;
  serverId: string;
  name: string;
  position: number;
}

export interface SoundboardSound {
  id: string;
  serverId: string;
  categoryId: string;
  label: string;
  emoji: string;
  objectPath: string;
  durationMs: number;
  position: number;
  audioRevision: number;
  enabled: boolean;
  assetStatus: SoundAssetStatus;
}

export interface SoundboardActivity {
  eventId: string;
  soundId: string;
  label: string;
  emoji: string;
  startedAt: number;
}

export interface SoundboardMetadataInput {
  label: string;
  emoji: string;
  categoryId: string;
}

export interface SoundboardCatalogController {
  categories: SoundboardCategory[];
  sounds: SoundboardSound[];
  loading: boolean;
  error: string | null;
  getBlob: (soundId: string) => Promise<Blob | null>;
  retrySound: (soundId: string) => Promise<void>;
  updateSound: (
    soundId: string,
    input: SoundboardMetadataInput,
  ) => Promise<void>;
}
