import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  SoundboardCategory,
  SoundboardMetadataInput,
  SoundboardSound,
  SoundboardUploadInput,
} from "../features/soundboard/types";
import { getSupabaseClient } from "./supabase";

interface CategoryRow {
  id: string;
  server_id: string;
  name: string;
  position: number;
  accepts_uploads: boolean;
}

interface SoundRow {
  id: string;
  server_id: string;
  category_id: string;
  label: string;
  emoji: string;
  object_path: string;
  duration_ms: number;
  position: number;
  audio_revision: number;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
}

interface FavoriteRow {
  sound_id: string;
}

export interface SoundboardCatalogSnapshot {
  categories: SoundboardCategory[];
  sounds: SoundboardSound[];
  favoriteSoundIds: Set<string>;
}

export async function loadSoundboardCatalog(
  serverId: string,
  userId?: string,
): Promise<SoundboardCatalogSnapshot> {
  const supabase = getSupabaseClient();
  const [categoryResult, soundResult, favoriteResult] = await Promise.all([
    supabase
      .from("soundboard_categories")
      .select("id,server_id,name,position,accepts_uploads")
      .eq("server_id", serverId)
      .order("position")
      .returns<CategoryRow[]>(),
    supabase
      .from("soundboard_sounds")
      .select(
        "id,server_id,category_id,label,emoji,object_path,duration_ms,position,audio_revision,enabled,created_by,created_at",
      )
      .eq("server_id", serverId)
      .eq("enabled", true)
      .order("position")
      .returns<SoundRow[]>(),
    userId
      ? supabase
          .from("soundboard_favorites")
          .select("sound_id")
          .eq("server_id", serverId)
          .eq("user_id", userId)
          .returns<FavoriteRow[]>()
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (soundResult.error) throw soundResult.error;
  if (favoriteResult.error) throw favoriteResult.error;

  return {
    categories: categoryResult.data.map(categoryFromRow),
    sounds: soundResult.data.map(soundFromRow),
    favoriteSoundIds: new Set(
      (favoriteResult.data ?? []).map((favorite) => favorite.sound_id),
    ),
  };
}

export async function downloadSoundboardObject(
  objectPath: string,
): Promise<Blob> {
  const { data, error } = await getSupabaseClient()
    .storage.from("soundboard")
    .download(objectPath);
  if (error) throw error;
  return data;
}

export async function updateSoundboardMetadata(
  soundId: string,
  input: SoundboardMetadataInput,
): Promise<SoundboardSound> {
  const label = input.label.trim();
  const emoji = input.emoji.trim();
  if (label.length < 1 || label.length > 50) {
    throw new Error("Sound names must be between 1 and 50 characters.");
  }
  if (emoji.length < 1 || Array.from(emoji).length > 16) {
    throw new Error("Choose one short emoji.");
  }

  const { data, error } = await getSupabaseClient()
    .from("soundboard_sounds")
    .update({ label, emoji })
    .eq("id", soundId)
    .select(
      "id,server_id,category_id,label,emoji,object_path,duration_ms,position,audio_revision,enabled,created_by,created_at",
    )
    .single<SoundRow>();
  if (error) throw error;
  return soundFromRow(data);
}

export async function setSoundboardFavorite(input: {
  serverId: string;
  userId: string;
  soundId: string;
  favorite: boolean;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const result = input.favorite
    ? await supabase.from("soundboard_favorites").insert({
        user_id: input.userId,
        server_id: input.serverId,
        sound_id: input.soundId,
      })
    : await supabase
        .from("soundboard_favorites")
        .delete()
        .eq("user_id", input.userId)
        .eq("sound_id", input.soundId);
  if (result.error) throw result.error;
}

export async function uploadSoundboardClip(
  serverId: string,
  input: SoundboardUploadInput,
): Promise<SoundboardSound> {
  const form = new FormData();
  form.set("action", "upload");
  form.set("serverId", serverId);
  form.set("label", input.label.trim());
  form.set("emoji", input.emoji.trim());
  form.set("clip", input.clip, "soundboard-clip.wav");

  const response: unknown = await getSupabaseClient().functions.invoke(
    "soundboard-manage",
    { body: form },
  );
  if (!isFunctionResponse(response)) {
    throw new Error("Bakbak received an invalid soundboard response.");
  }
  if (response.error) throw await soundboardFunctionError(response.error);
  if (!isRecord(response.data) || !isSoundRow(response.data.sound)) {
    throw new Error("Bakbak published the sound but returned an invalid row.");
  }
  return soundFromRow(response.data.sound);
}

export async function deleteSoundboardSound(soundId: string): Promise<void> {
  const response: unknown = await getSupabaseClient().functions.invoke(
    "soundboard-manage",
    { body: { action: "delete", soundId } },
  );
  if (!isFunctionResponse(response)) {
    throw new Error("Bakbak received an invalid soundboard response.");
  }
  if (response.error) throw await soundboardFunctionError(response.error);
}

export function subscribeToSoundboardCatalog(
  serverId: string,
  userId: string | undefined,
  onChange: () => void,
): () => void {
  const supabase = getSupabaseClient();
  let channel: RealtimeChannel = supabase
    .channel(`soundboard-catalog:${serverId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "soundboard_categories",
        filter: `server_id=eq.${serverId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "soundboard_sounds",
        filter: `server_id=eq.${serverId}`,
      },
      onChange,
    );
  if (userId) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "soundboard_favorites",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    );
  }
  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function categoryFromRow(row: CategoryRow): SoundboardCategory {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    position: row.position,
    acceptsUploads: row.accepts_uploads,
  };
}

function soundFromRow(row: SoundRow): SoundboardSound {
  return {
    id: row.id,
    serverId: row.server_id,
    categoryId: row.category_id,
    label: row.label,
    emoji: row.emoji,
    objectPath: row.object_path,
    durationMs: row.duration_ms,
    position: row.position,
    audioRevision: row.audio_revision,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: row.created_at,
    assetStatus: "loading",
  };
}

async function soundboardFunctionError(error: unknown): Promise<Error> {
  let code = "";
  if (isRecord(error) && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (isRecord(body) && typeof body.error === "string") code = body.error;
    } catch {
      // The normalized fallback below is intentionally free of service detail.
    }
  }

  const messages: Record<string, string> = {
    member_upload_limit: "You already have 25 active sounds in Bakbak.",
    server_upload_limit: "This server already has 200 member-uploaded sounds.",
    server_membership_required: "You are no longer a member of this server.",
    clip_duration_out_of_range: "Choose a clip between 0.1 and 5 seconds.",
    unsupported_wav_format: "Bakbak could not normalize that audio file.",
    sound_delete_forbidden: "Only the uploader or a server admin can do that.",
    sound_not_found: "That sound no longer exists.",
  };
  return new Error(messages[code] ?? "Bakbak could not update the soundboard.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFunctionResponse(
  value: unknown,
): value is { data: unknown; error: unknown } {
  return isRecord(value) && "data" in value && "error" in value;
}

function isSoundRow(value: unknown): value is SoundRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.server_id === "string" &&
    typeof value.category_id === "string" &&
    typeof value.label === "string" &&
    typeof value.emoji === "string" &&
    typeof value.object_path === "string" &&
    typeof value.duration_ms === "number" &&
    typeof value.position === "number" &&
    typeof value.audio_revision === "number" &&
    typeof value.enabled === "boolean" &&
    (typeof value.created_by === "string" || value.created_by === null) &&
    typeof value.created_at === "string"
  );
}
