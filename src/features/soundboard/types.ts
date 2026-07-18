export type SoundAssetStatus = "loading" | "ready" | "error";

export interface SoundboardCategory {
  id: string;
  serverId: string;
  name: string;
  position: number;
  acceptsUploads: boolean;
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
  createdBy: string | null;
  createdAt: string;
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
}

export interface SoundboardUploadInput {
  label: string;
  emoji: string;
  clip: Blob;
}

export interface SoundboardCatalogController {
  categories: SoundboardCategory[];
  sounds: SoundboardSound[];
  favoriteSoundIds: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  getBlob: (soundId: string) => Promise<Blob | null>;
  retrySound: (soundId: string) => Promise<void>;
  toggleFavorite: (soundId: string) => Promise<void>;
  uploadSound: (input: SoundboardUploadInput) => Promise<void>;
  deleteSound: (soundId: string) => Promise<void>;
  updateSound: (
    soundId: string,
    input: SoundboardMetadataInput,
  ) => Promise<void>;
}
