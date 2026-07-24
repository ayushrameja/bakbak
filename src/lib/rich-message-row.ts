import type {
  MessageAttachment,
  LinkPreview,
  MessagePresentation,
  MessageReplyPreview,
  MessageSegment,
  StickerReaction,
} from "./types";

export interface RichMessageRow {
  id: string;
  author_id: string | null;
  body: string;
  content: unknown;
  created_at: string;
  message_kind?: "member" | "system";
  system_event?: unknown;
  link_preview?: unknown;
  link_preview_attempted_at?: string | null;
  presentation?: unknown;
  reply_notifies_author?: boolean;
  deleted_at?: string | null;
  reply_to_id?: string | null;
  reply?: {
    id: string;
    author_id: string | null;
    body: string;
    deleted_at: string | null;
  } | null;
  attachments?: Array<{
    id: string;
    kind: "image" | "gif" | "video";
    mime_type: string;
    byte_size: number;
    width: number;
    height: number;
    duration_ms: number | null;
    object_path: string;
    poster_path: string;
  }>;
  reaction_rows?: Array<{ sticker_id: string; user_id: string }>;
}

export interface RichReplyRow {
  id: string;
  author_id: string | null;
  body: string;
  deleted_at: string | null;
}

export function parseMessageContent(value: unknown): MessageSegment[] | null {
  if (!Array.isArray(value)) return null;
  const segments: MessageSegment[] = [];
  for (const segment of value as unknown[]) {
    if (!segment || typeof segment !== "object" || !("type" in segment)) {
      return null;
    }
    if (
      segment.type === "text" &&
      "text" in segment &&
      typeof segment.text === "string"
    ) {
      segments.push({ type: "text", text: segment.text });
    } else if (
      segment.type === "mention" &&
      "user_id" in segment &&
      "fallback" in segment &&
      typeof segment.user_id === "string" &&
      typeof segment.fallback === "string"
    ) {
      segments.push({
        type: "mention",
        userId: segment.user_id,
        fallback: segment.fallback,
      });
    } else {
      return null;
    }
  }
  return segments;
}

export function parsePresentation(value: unknown): MessagePresentation | null {
  if (!value || typeof value !== "object" || !("kind" in value)) return null;
  if (
    value.kind === "sticker" &&
    "sticker_id" in value &&
    typeof value.sticker_id === "string"
  ) {
    return { kind: "sticker", stickerId: value.sticker_id };
  }
  if (
    value.kind === "giphy" &&
    "asset_id" in value &&
    "asset_kind" in value &&
    "title" in value &&
    "alt_text" in value &&
    "width" in value &&
    "height" in value &&
    typeof value.asset_id === "string" &&
    (value.asset_kind === "gif" || value.asset_kind === "sticker") &&
    typeof value.title === "string" &&
    typeof value.alt_text === "string" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  ) {
    return {
      kind: "giphy",
      assetId: value.asset_id,
      assetKind: value.asset_kind,
      title: value.title,
      altText: value.alt_text,
      width: value.width,
      height: value.height,
    };
  }
  return null;
}

export function parseLinkPreview(value: unknown): LinkPreview | null {
  if (!value || typeof value !== "object" || !("kind" in value)) return null;
  if (
    value.kind === "page" &&
    "url" in value &&
    "title" in value &&
    "description" in value &&
    "siteName" in value &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.siteName === "string"
  ) {
    return {
      kind: "page",
      url: value.url,
      title: value.title,
      description: value.description,
      siteName: value.siteName,
    };
  }
  if (
    value.kind === "youtube" &&
    "url" in value &&
    "videoId" in value &&
    "title" in value &&
    typeof value.url === "string" &&
    typeof value.videoId === "string" &&
    /^[A-Za-z0-9_-]{11}$/.test(value.videoId) &&
    typeof value.title === "string"
  ) {
    return {
      kind: "youtube",
      url: value.url,
      videoId: value.videoId,
      title: value.title,
    };
  }
  return null;
}

export function parseSystemEvent(value: unknown) {
  if (!value || typeof value !== "object" || !("type" in value)) return null;
  if (
    value.type === "member_joined" &&
    "member_id" in value &&
    "member_name" in value &&
    "joined_at" in value &&
    typeof value.member_id === "string" &&
    typeof value.member_name === "string" &&
    typeof value.joined_at === "string"
  ) {
    return {
      type: "member_joined" as const,
      memberId: value.member_id,
      memberName: value.member_name,
      joinedAt: value.joined_at,
    };
  }
  if (
    value.type === "release_published" &&
    "release_id" in value &&
    "tag" in value &&
    "name" in value &&
    "notes" in value &&
    "url" in value &&
    "published_at" in value &&
    typeof value.release_id === "number" &&
    typeof value.tag === "string" &&
    typeof value.name === "string" &&
    typeof value.notes === "string" &&
    typeof value.url === "string" &&
    typeof value.published_at === "string"
  ) {
    return {
      type: "release_published" as const,
      releaseId: value.release_id,
      tag: value.tag,
      name: value.name,
      notes: value.notes,
      url: value.url,
      publishedAt: value.published_at,
    };
  }
  return null;
}

export function parseAttachments(
  rows: RichMessageRow["attachments"],
): MessageAttachment[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    objectPath: row.object_path,
    posterPath: row.poster_path,
  }));
}

export function parseReply(
  row: RichMessageRow["reply"],
): MessageReplyPreview | null {
  if (
    !row ||
    Array.isArray(row) ||
    typeof row.id !== "string" ||
    typeof row.body !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: "",
    body: row.body,
    deleted: Boolean(row.deleted_at),
  };
}

export function attachReplyRows<T extends RichMessageRow>(
  messages: readonly T[],
  replies: readonly RichReplyRow[],
): T[] {
  const repliesById = new Map(replies.map((reply) => [reply.id, reply]));
  return messages.map((message) => ({
    ...message,
    reply: message.reply_to_id
      ? (repliesById.get(message.reply_to_id) ?? null)
      : null,
  }));
}

export function parseReactions(
  rows: RichMessageRow["reaction_rows"],
): StickerReaction[] {
  const grouped = new Map<string, string[]>();
  (rows ?? []).forEach((row) => {
    const users = grouped.get(row.sticker_id) ?? [];
    users.push(row.user_id);
    grouped.set(row.sticker_id, users);
  });
  return [...grouped].map(([stickerId, userIds]) => ({
    stickerId,
    userIds,
    count: userIds.length,
    reactedByCurrentUser: false,
  }));
}

export const CHANNEL_RICH_SELECT =
  "id,channel_id,author_id,body,content,created_at,message_kind,system_event,link_preview,link_preview_attempted_at,presentation,reply_to_id,reply_notifies_author,deleted_at,attachments:message_attachments!message_attachments_message_id_fkey(id,kind,mime_type,byte_size,width,height,duration_ms,object_path,poster_path),reaction_rows:message_sticker_reactions!message_sticker_reactions_message_id_fkey(sticker_id,user_id)";

export const DIRECT_RICH_SELECT =
  "id,conversation_id,author_id,body,content,created_at,link_preview,link_preview_attempted_at,presentation,reply_to_id,reply_notifies_author,deleted_at,attachments:message_attachments!message_attachments_direct_message_id_fkey(id,kind,mime_type,byte_size,width,height,duration_ms,object_path,poster_path),reaction_rows:message_sticker_reactions!message_sticker_reactions_direct_message_id_fkey(sticker_id,user_id)";
