import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type {
  DirectConversation,
  DirectMessage,
  MessageSegment,
  ServerMember,
} from "./types";

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

interface DirectMessageRow {
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

function parseMessageContent(value: unknown): MessageSegment[] | null {
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

function directMessageFromRow(row: DirectMessageRow): DirectMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorId: row.author_id,
    body: row.body,
    content: parseMessageContent(row.content),
    createdAt: row.created_at,
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
): Promise<DirectMessage[]> {
  const { data, error } = await getSupabaseClient()
    .from("direct_messages")
    .select("id,conversation_id,author_id,body,content,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(200)
    .returns<DirectMessageRow[]>();
  if (error) throw error;
  return data.map(directMessageFromRow);
}

export async function sendDirectMessage(
  conversationId: string,
  content: MessageSegment[],
): Promise<DirectMessage> {
  const { data, error } = await getSupabaseClient()
    .rpc("send_direct_message", {
      p_conversation_id: conversationId,
      p_content: content.map((segment) =>
        segment.type === "text"
          ? segment
          : {
              type: "mention",
              user_id: segment.userId,
              fallback: segment.fallback,
            },
      ),
    })
    .select("id,conversation_id,author_id,body,content,created_at")
    .single<DirectMessageRow>();
  if (error) throw error;
  return directMessageFromRow(data);
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
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
      },
      (payload) => onMessage(directMessageFromRow(payload.new)),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
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
