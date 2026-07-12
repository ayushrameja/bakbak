import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  SoundboardCategory,
  SoundboardMetadataInput,
  SoundboardSound,
} from "../features/soundboard/types";
import { getSupabaseClient } from "./supabase";

interface CategoryRow {
  id: string;
  server_id: string;
  name: string;
  position: number;
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
}

export interface SoundboardCatalogSnapshot {
  categories: SoundboardCategory[];
  sounds: SoundboardSound[];
}

export async function loadSoundboardCatalog(
  serverId: string,
): Promise<SoundboardCatalogSnapshot> {
  const supabase = getSupabaseClient();
  const [categoryResult, soundResult] = await Promise.all([
    supabase
      .from("soundboard_categories")
      .select("id,server_id,name,position")
      .eq("server_id", serverId)
      .order("position")
      .returns<CategoryRow[]>(),
    supabase
      .from("soundboard_sounds")
      .select(
        "id,server_id,category_id,label,emoji,object_path,duration_ms,position,audio_revision,enabled",
      )
      .eq("server_id", serverId)
      .eq("enabled", true)
      .order("position")
      .returns<SoundRow[]>(),
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (soundResult.error) throw soundResult.error;

  return {
    categories: categoryResult.data.map(categoryFromRow),
    sounds: soundResult.data.map(soundFromRow),
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
    .update({ label, emoji, category_id: input.categoryId })
    .eq("id", soundId)
    .select(
      "id,server_id,category_id,label,emoji,object_path,duration_ms,position,audio_revision,enabled",
    )
    .single<SoundRow>();
  if (error) throw error;
  return soundFromRow(data);
}

export function subscribeToSoundboardCatalog(
  serverId: string,
  onChange: () => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
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
    )
    .subscribe();

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
    assetStatus: "loading",
  };
}
