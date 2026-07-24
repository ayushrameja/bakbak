import type { RealtimeChannel } from "@supabase/supabase-js";
import { BakbakCache } from "./local-cache";
import { getSupabaseClient } from "./supabase";
import type { Sticker } from "./types";

const mediaCache = new BakbakCache();

interface StickerRow {
  id: string;
  server_id: string;
  created_by: string;
  label: string;
  poster_path: string;
  animation_path: string | null;
  width: number;
  height: number;
  enabled: boolean;
  created_at: string;
}

export async function loadStickers(serverId: string): Promise<Sticker[]> {
  const { data, error } = await getSupabaseClient()
    .from("stickers")
    .select(
      "id,server_id,created_by,label,poster_path,animation_path,width,height,enabled,created_at",
    )
    .eq("server_id", serverId)
    .order("created_at")
    .returns<StickerRow[]>();
  if (error) throw error;
  return data.map(stickerFromRow);
}

export async function uploadSticker(
  serverId: string,
  label: string,
  poster: Blob,
  animation: File | null,
): Promise<Sticker> {
  const form = new FormData();
  form.set("action", "upload");
  form.set("serverId", serverId);
  form.set("label", label);
  form.set("poster", poster, "poster.webp");
  if (animation) form.set("animation", animation, "animation.gif");
  const response = (await getSupabaseClient().functions.invoke(
    "sticker-manage",
    { body: form },
  )) as unknown as { data: unknown; error: Error | null };
  if (response.error) throw response.error;
  if (isRecord(response.data) && typeof response.data.error === "string") {
    throw new Error(humanizeStickerError(response.data.error));
  }
  if (!isRecord(response.data) || !isStickerRow(response.data.sticker)) {
    throw new Error("Bakbak received an invalid sticker response.");
  }
  return stickerFromRow(response.data.sticker);
}

export async function archiveSticker(stickerId: string): Promise<void> {
  const response = (await getSupabaseClient().functions.invoke(
    "sticker-manage",
    { body: { action: "delete", stickerId } },
  )) as unknown as { data: unknown; error: Error | null };
  if (response.error) throw response.error;
  if (isRecord(response.data) && typeof response.data.error === "string") {
    throw new Error(humanizeStickerError(response.data.error));
  }
}

export async function downloadStickerMedia(
  path: string,
  cachePoster = false,
): Promise<Blob> {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();
  if (cachePoster && session) {
    const cached = await mediaCache.readMessageMedia(
      session.user.id,
      "message-stickers",
      path,
    );
    if (cached) return cached;
  }
  const { data, error } = await getSupabaseClient()
    .storage.from("message-stickers")
    .download(path);
  if (error) throw error;
  if (cachePoster && session) {
    await mediaCache.writeMessageMedia(
      session.user.id,
      "message-stickers",
      path,
      data,
    );
  }
  return data;
}

export async function toggleStickerReaction(
  messageKind: "channel" | "direct",
  messageId: string,
  stickerId: string,
): Promise<boolean> {
  const response = (await getSupabaseClient().rpc(
    "toggle_message_sticker_reaction",
    {
      p_message_kind: messageKind,
      p_message_id: messageId,
      p_sticker_id: stickerId,
    },
  )) as unknown as { data: unknown; error: Error | null };
  if (response.error) throw response.error;
  return Boolean(response.data);
}

export function subscribeToStickers(
  serverId: string,
  onChange: () => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
    .channel(`stickers:${serverId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "stickers",
        filter: `server_id=eq.${serverId}`,
      },
      onChange,
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

export function subscribeToStickerReactions(
  onChange: (messageId: string) => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
    .channel("message-sticker-reactions")
    .on<{
      message_id: string | null;
      direct_message_id: string | null;
    }>(
      "postgres_changes",
      { event: "*", schema: "public", table: "message_sticker_reactions" },
      (payload) => {
        const row = (payload.new ?? payload.old) as
          | {
              message_id: string | null;
              direct_message_id: string | null;
            }
          | undefined;
        const id = row?.message_id ?? row?.direct_message_id;
        if (id) onChange(id);
      },
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

function stickerFromRow(row: StickerRow): Sticker {
  return {
    id: row.id,
    serverId: row.server_id,
    createdBy: row.created_by,
    label: row.label,
    posterPath: row.poster_path,
    animationPath: row.animation_path,
    width: row.width,
    height: row.height,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStickerRow(value: unknown): value is StickerRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.server_id === "string" &&
    typeof value.created_by === "string" &&
    typeof value.label === "string" &&
    typeof value.poster_path === "string" &&
    (typeof value.animation_path === "string" ||
      value.animation_path === null) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.enabled === "boolean" &&
    typeof value.created_at === "string"
  );
}

function humanizeStickerError(code: string): string {
  const messages: Record<string, string> = {
    member_sticker_limit: "You already have 25 active Bakbak stickers.",
    server_sticker_limit: "This server already has 200 active stickers.",
    member_media_limit:
      "Your stored Bakbak media has reached the 1 GiB account limit.",
    sticker_dimensions_invalid: "Stickers must fit within 512×512 pixels.",
    sticker_delete_forbidden:
      "Only the uploader or a server admin can remove that sticker.",
  };
  return messages[code] ?? "Bakbak could not finish that sticker request.";
}
