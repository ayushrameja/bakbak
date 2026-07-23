import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type {
  AppUser,
  Channel,
  ChannelActivity,
  ChannelCategory,
  ChatMessage,
  MessagePresentation,
  MessageSegment,
  MessageCursor,
  ServerMember,
  WorkspaceSnapshot,
} from "./types";
import {
  attachReplyRows,
  CHANNEL_RICH_SELECT,
  parseAttachments,
  parseMessageContent,
  parsePresentation,
  parseReactions,
  parseReply,
  type RichReplyRow,
  type RichMessageRow,
} from "./rich-message-row";

interface ServerRow {
  id: string;
  name: string;
}

interface ChannelRow {
  id: string;
  server_id: string;
  category_id: string | null;
  name: string;
  kind: "text" | "voice";
  position: number;
}

interface ChannelCategoryRow {
  id: string;
  server_id: string;
  name: string;
  position: number;
}

interface MembershipRow {
  user_id: string;
  role: "admin" | "member";
}

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path: string | null;
  avatar_animation_path: string | null;
  cover_path: string | null;
  cover_animation_path: string | null;
  cover_position_x: number;
  cover_position_y: number;
  description: string;
}

interface MessageRow extends RichMessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  content: unknown;
  created_at: string;
}

interface ChannelActivityRow {
  channel_id: string;
  latest_message_id: string | null;
  last_read_message_id: string | null;
  has_unread: boolean;
}

interface ChannelReadStateRow {
  user_id: string;
  channel_id: string;
  last_read_message_id: string;
  updated_at: string;
}

export class MissingMembershipError extends Error {
  constructor() {
    super("This account is not a member of a Bakbak server yet.");
    this.name = "MissingMembershipError";
  }
}

function messageFromRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
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

export async function loadLiveWorkspace(
  currentUser: Pick<AppUser, "id" | "email">,
): Promise<WorkspaceSnapshot> {
  const supabase = getSupabaseClient();
  const { data: servers, error: serverError } = await supabase
    .from("servers")
    .select("id,name")
    .order("created_at")
    .limit(1)
    .returns<ServerRow[]>();
  if (serverError) throw serverError;
  const server = servers[0];
  if (!server) throw new MissingMembershipError();

  const [categoryResult, channelResult, membershipResult] = await Promise.all([
    supabase
      .from("channel_categories")
      .select("id,server_id,name,position")
      .eq("server_id", server.id)
      .order("position")
      .returns<ChannelCategoryRow[]>(),
    supabase
      .from("channels")
      .select("id,server_id,category_id,name,kind,position")
      .eq("server_id", server.id)
      .order("position")
      .returns<ChannelRow[]>(),
    supabase
      .from("memberships")
      .select("user_id,role")
      .eq("server_id", server.id)
      .returns<MembershipRow[]>(),
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (channelResult.error) throw channelResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const userIds = membershipResult.data.map((membership) => membership.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id,display_name,avatar_url,avatar_path,avatar_animation_path,cover_path,cover_animation_path,cover_position_x,cover_position_y,description",
    )
    .in("id", userIds)
    .returns<ProfileRow[]>();
  if (profileError) throw profileError;
  const profilesById = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );

  const members: ServerMember[] = membershipResult.data.map((membership) => {
    const profile = profilesById.get(membership.user_id);
    const isCurrent = membership.user_id === currentUser.id;
    return {
      id: membership.user_id,
      displayName: profile?.display_name ?? "Friend",
      email: isCurrent ? currentUser.email : "",
      avatarUrl: profile?.avatar_url ?? null,
      avatarAnimationUrl: null,
      avatarPath: profile?.avatar_path ?? null,
      avatarAnimationPath: profile?.avatar_animation_path ?? null,
      coverUrl: null,
      coverAnimationUrl: null,
      coverPath: profile?.cover_path ?? null,
      coverAnimationPath: profile?.cover_animation_path ?? null,
      coverPositionX: profile?.cover_position_x ?? 50,
      coverPositionY: profile?.cover_position_y ?? 50,
      description: profile?.description ?? "",
      status: isCurrent ? "online" : "offline",
      role: membership.role,
    };
  });

  const channelCategories: ChannelCategory[] = categoryResult.data.map(
    (category) => ({
      id: category.id,
      serverId: category.server_id,
      name: category.name,
      position: category.position,
    }),
  );

  const channels: Channel[] = channelResult.data.map((channel) => ({
    id: channel.id,
    serverId: channel.server_id,
    categoryId: channel.category_id,
    name: channel.name,
    kind: channel.kind,
    position: channel.position,
    topic:
      channel.kind === "voice"
        ? "Drop in when you feel like talking."
        : "A private conversation for server members.",
  }));

  return {
    server: {
      id: server.id,
      name: server.name,
      description: "A private place for friends.",
    },
    channelCategories,
    channels,
    members,
    currentUserRole:
      membershipResult.data.find(
        (membership) => membership.user_id === currentUser.id,
      )?.role ?? "member",
  };
}

export async function loadLiveMessages(
  channelId: string,
  options: {
    before?: MessageCursor;
    after?: MessageCursor;
    limit?: number;
  } = {},
): Promise<ChatMessage[]> {
  const newestFirst = !options.after;
  let query = getSupabaseClient()
    .from("messages")
    .select(CHANNEL_RICH_SELECT)
    .eq("channel_id", channelId);
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
    .returns<MessageRow[]>();
  if (error) throw error;
  const messages = (await hydrateChannelReplyRows(data)).map(messageFromRow);
  return newestFirst ? messages.reverse() : messages;
}

export async function sendLiveMessage(
  channelId: string,
  content: MessageSegment[],
  options: {
    replyToId?: string | null;
    notifyReplyAuthor?: boolean;
    attachmentIds?: string[];
    presentation?: MessagePresentation | null;
  } = {},
): Promise<ChatMessage> {
  const rich =
    Boolean(options.replyToId) ||
    Boolean(options.attachmentIds?.length) ||
    Boolean(options.presentation);
  const rpcName = rich ? "send_message_v2" : "send_message";
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
      p_channel_id: channelId,
      p_content: serialized,
      ...(rich && {
        p_reply_to_id: options.replyToId ?? null,
        p_reply_notifies_author: options.notifyReplyAuthor ?? true,
        p_attachment_ids: options.attachmentIds ?? [],
        p_presentation: serializePresentation(options.presentation ?? null),
      }),
    })
    .select(
      "id,channel_id,author_id,body,content,created_at,presentation,reply_notifies_author,deleted_at",
    )
    .single<MessageRow>();
  if (error) throw error;
  return rich ? await loadLiveMessageById(data.id) : messageFromRow(data);
}

export async function loadLiveMessageById(
  messageId: string,
): Promise<ChatMessage> {
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .select(CHANNEL_RICH_SELECT)
    .eq("id", messageId)
    .single<MessageRow>();
  if (error) throw error;
  const [hydrated] = await hydrateChannelReplyRows([data]);
  if (!hydrated) throw new Error("The message could not be hydrated.");
  return messageFromRow(hydrated);
}

async function hydrateChannelReplyRows(
  messages: readonly MessageRow[],
): Promise<MessageRow[]> {
  const replyIds = [
    ...new Set(
      messages.flatMap((message) =>
        message.reply_to_id ? [message.reply_to_id] : [],
      ),
    ),
  ];
  if (!replyIds.length) return attachReplyRows(messages, []);
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .select("id,author_id,body,deleted_at")
    .in("id", replyIds)
    .returns<RichReplyRow[]>();
  if (error) throw error;
  return attachReplyRows(messages, data);
}

export async function loadLiveChannelActivity(
  serverId: string,
): Promise<ChannelActivity[]> {
  const response: unknown = await getSupabaseClient().rpc(
    "get_channel_activity",
    { p_server_id: serverId },
  );
  const { data, error } = response as { data: unknown; error: unknown };
  if (error) {
    throw new Error("Could not load channel activity.", { cause: error });
  }
  const rows = (data ?? []) as unknown as ChannelActivityRow[];
  return rows.map((row) => ({
    channelId: row.channel_id,
    latestMessageId: row.latest_message_id,
    lastReadMessageId: row.last_read_message_id,
    hasUnread: row.has_unread,
  }));
}

export async function markLiveChannelRead(
  channelId: string,
  messageId: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("mark_channel_read", {
    p_channel_id: channelId,
    p_message_id: messageId,
  });
  if (error) throw error;
}

export function subscribeToLiveReadStates(
  userId: string,
  onReadState: (channelId: string, lastReadMessageId: string) => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
    .channel(`channel-read-states:${userId}`)
    .on<ChannelReadStateRow>(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "channel_read_states",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new;
        if (row && "channel_id" in row) {
          onReadState(row.channel_id, row.last_read_message_id);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToLiveMessages(
  channelId: string,
  onMessage: (message: ChatMessage) => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase
    .channel(`messages:${channelId}`)
    .on<MessageRow>(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        const row = payload.new;
        if (!row || !("id" in row)) return;
        void loadLiveMessageById(row.id)
          .then(onMessage)
          .catch(() => onMessage(messageFromRow(row)));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
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
