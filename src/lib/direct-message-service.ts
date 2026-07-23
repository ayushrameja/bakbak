import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type {
  DirectConversation,
  DirectMessage,
  MessagePresentation,
  MessageSegment,
  MessageCursor,
  ServerMember,
} from "./types";
import {
  attachReplyRows,
  DIRECT_RICH_SELECT,
  parseAttachments,
  parseMessageContent,
  parsePresentation,
  parseReactions,
  parseReply,
  type RichReplyRow,
  type RichMessageRow,
} from "./rich-message-row";

interface DirectConversationRow {
  conversation_id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path: string | null;
  avatar_animation_path: string | null;
  cover_path: string | null;
  cover_animation_path: string | null;
  cover_position_x: number;
  cover_position_y: number;
  description: string;
  created_at: string;
  updated_at: string;
  latest_message_id: string | null;
  latest_message_author_id: string | null;
  latest_message_body: string | null;
  latest_message_created_at: string | null;
  has_unread: boolean;
}

interface DirectMessageRow extends RichMessageRow {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  content: unknown;
  created_at: string;
}

interface DirectReadStateRow {
  user_id: string;
  conversation_id: string;
  last_read_message_id: string | null;
}

function directMessageFromRow(row: DirectMessageRow): DirectMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorId: row.author_id,
    body: row.body,
    content: parseMessageContent(row.content),
    createdAt: row.created_at,
    presentation: parsePresentation(row.presentation),
    attachments: parseAttachments(row.attachments),
    reply: parseReply(row.reply),
    replyNotifiesAuthor: row.reply_notifies_author ?? false,
    reactions: parseReactions(row.reaction_rows),
    deletedAt: row.deleted_at ?? null,
  };
}

function memberFromConversationRow(row: DirectConversationRow): ServerMember {
  return {
    id: row.other_user_id,
    displayName: row.display_name,
    email: "",
    avatarUrl: row.avatar_url,
    avatarAnimationUrl: null,
    avatarPath: row.avatar_path,
    avatarAnimationPath: row.avatar_animation_path,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: row.cover_path,
    coverAnimationPath: row.cover_animation_path,
    coverPositionX: row.cover_position_x,
    coverPositionY: row.cover_position_y,
    description: row.description,
    status: "offline",
    role: "member",
  };
}

function conversationFromRow(row: DirectConversationRow): DirectConversation {
  return {
    id: row.conversation_id,
    otherMember: memberFromConversationRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestMessageId: row.latest_message_id,
    latestMessageAuthorId: row.latest_message_author_id,
    latestMessageBody: row.latest_message_body,
    latestMessageCreatedAt: row.latest_message_created_at,
    hasUnread: row.has_unread,
  };
}

export async function loadDirectConversations(): Promise<DirectConversation[]> {
  const response: unknown = await getSupabaseClient().rpc(
    "get_direct_conversations",
  );
  const { data, error } = response as {
    data: DirectConversationRow[] | null;
    error: unknown;
  };
  if (error)
    throw new Error("Could not load direct messages.", { cause: error });
  return (data ?? []).map(conversationFromRow);
}

export async function getOrCreateDirectConversation(
  targetUserId: string,
): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .rpc("get_or_create_direct_conversation", {
      p_target_user_id: targetUserId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

export async function loadDirectMessages(
  conversationId: string,
  options: {
    before?: MessageCursor;
    after?: MessageCursor;
    limit?: number;
  } = {},
): Promise<DirectMessage[]> {
  const newestFirst = !options.after;
  let query = getSupabaseClient()
    .from("direct_messages")
    .select(DIRECT_RICH_SELECT)
    .eq("conversation_id", conversationId);
  if (options.before) {
    query = query.or(
      `created_at.lt.${options.before.createdAt},and(created_at.eq.${options.before.createdAt},id.lt.${options.before.id})`,
    );
  }
  if (options.after) {
    query = query.or(
      `created_at.gt.${options.after.createdAt},and(created_at.eq.${options.after.createdAt},id.gt.${options.after.id})`,
    );
  }
  const { data, error } = await query
    .order("created_at", { ascending: !newestFirst })
    .order("id", { ascending: !newestFirst })
    .limit(options.limit ?? 50)
    .returns<DirectMessageRow[]>();
  if (error) throw error;
  const messages = (await hydrateDirectReplyRows(data)).map(
    directMessageFromRow,
  );
  return newestFirst ? messages.reverse() : messages;
}

export async function sendDirectMessage(
  conversationId: string,
  content: MessageSegment[],
  options: {
    replyToId?: string | null;
    notifyReplyAuthor?: boolean;
    attachmentIds?: string[];
    presentation?: MessagePresentation | null;
  } = {},
): Promise<DirectMessage> {
  const rich =
    Boolean(options.replyToId) ||
    Boolean(options.attachmentIds?.length) ||
    Boolean(options.presentation);
  const rpcName = rich ? "send_direct_message_v2" : "send_direct_message";
  const serialized = content.map((segment) =>
    segment.type === "text"
      ? segment
      : {
          type: "mention",
          user_id: segment.userId,
          fallback: segment.fallback,
        },
  );
  const { data, error } = await getSupabaseClient()
    .rpc(rpcName, {
      p_conversation_id: conversationId,
      p_content: serialized,
      ...(rich && {
        p_reply_to_id: options.replyToId ?? null,
        p_reply_notifies_author: options.notifyReplyAuthor ?? true,
        p_attachment_ids: options.attachmentIds ?? [],
        p_presentation: serializePresentation(options.presentation ?? null),
      }),
    })
    .select(
      "id,conversation_id,author_id,body,content,created_at,presentation,reply_notifies_author,deleted_at",
    )
    .single<DirectMessageRow>();
  if (error) throw error;
  return rich
    ? await loadDirectMessageById(data.id)
    : directMessageFromRow(data);
}

export async function loadDirectMessageById(
  messageId: string,
): Promise<DirectMessage> {
  const { data, error } = await getSupabaseClient()
    .from("direct_messages")
    .select(DIRECT_RICH_SELECT)
    .eq("id", messageId)
    .single<DirectMessageRow>();
  if (error) throw error;
  const [hydrated] = await hydrateDirectReplyRows([data]);
  if (!hydrated) throw new Error("The direct message could not be hydrated.");
  return directMessageFromRow(hydrated);
}

async function hydrateDirectReplyRows(
  messages: readonly DirectMessageRow[],
): Promise<DirectMessageRow[]> {
  const replyIds = [
    ...new Set(
      messages.flatMap((message) =>
        message.reply_to_id ? [message.reply_to_id] : [],
      ),
    ),
  ];
  if (!replyIds.length) return attachReplyRows(messages, []);
  const { data, error } = await getSupabaseClient()
    .from("direct_messages")
    .select("id,author_id,body,deleted_at")
    .in("id", replyIds)
    .returns<RichReplyRow[]>();
  if (error) throw error;
  return attachReplyRows(messages, data);
}

export async function markDirectConversationRead(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc(
    "mark_direct_conversation_read",
    {
      p_conversation_id: conversationId,
      p_message_id: messageId,
    },
  );
  if (error) throw error;
}

export function subscribeToDirectMessages(
  onMessage: (message: DirectMessage) => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
    .channel("direct-messages")
    .on<DirectMessageRow>(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "direct_messages",
      },
      (payload) => {
        const row = payload.new;
        if (!row || !("id" in row)) return;
        void loadDirectMessageById(row.id)
          .then(onMessage)
          .catch(() => onMessage(directMessageFromRow(row)));
      },
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

function serializePresentation(
  presentation: MessagePresentation | null,
): Record<string, unknown> | null {
  if (!presentation) return null;
  if (presentation.kind === "sticker") {
    return { kind: "sticker", sticker_id: presentation.stickerId };
  }
  return {
    kind: "giphy",
    asset_id: presentation.assetId,
    asset_kind: presentation.assetKind,
    title: presentation.title,
    alt_text: presentation.altText,
    width: presentation.width,
    height: presentation.height,
  };
}

export function subscribeToDirectReadStates(
  userId: string,
  onReadState: (
    conversationId: string,
    lastReadMessageId: string | null,
  ) => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
    .channel(`direct-read-states:${userId}`)
    .on<DirectReadStateRow>(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "direct_read_states",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new && "conversation_id" in payload.new) {
          onReadState(
            payload.new.conversation_id,
            payload.new.last_read_message_id,
          );
        }
      },
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
