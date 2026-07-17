import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type {
  AppUser,
  Channel,
  ChannelActivity,
  ChatMessage,
  MessageSegment,
  ServerMember,
  WorkspaceSnapshot,
} from "./types";

interface ServerRow {
  id: string;
  name: string;
}

interface ChannelRow {
  id: string;
  server_id: string;
  name: string;
  kind: "text" | "voice";
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

interface MessageRow {
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

function parseMessageContent(value: unknown): MessageSegment[] | null {
  if (!Array.isArray(value)) return null;
  const rawSegments = value as unknown[];
  const segments: MessageSegment[] = [];
  for (const segment of rawSegments) {
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

  const [channelResult, membershipResult] = await Promise.all([
    supabase
      .from("channels")
      .select("id,server_id,name,kind,position")
      .eq("server_id", server.id)
      .order("position")
      .returns<ChannelRow[]>(),
    supabase
      .from("memberships")
      .select("user_id,role")
      .eq("server_id", server.id)
      .returns<MembershipRow[]>(),
  ]);
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

  const channels: Channel[] = channelResult.data.map((channel) => ({
    id: channel.id,
    serverId: channel.server_id,
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
): Promise<ChatMessage[]> {
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .select("id,channel_id,author_id,body,content,created_at")
    .eq("channel_id", channelId)
    .order("created_at")
    .limit(200)
    .returns<MessageRow[]>();
  if (error) throw error;
  return data.map(messageFromRow);
}

export async function sendLiveMessage(
  channelId: string,
  content: MessageSegment[],
): Promise<ChatMessage> {
  const { data, error } = await getSupabaseClient()
    .rpc("send_message", {
      p_channel_id: channelId,
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
    .select("id,channel_id,author_id,body,content,created_at")
    .single<MessageRow>();
  if (error) throw error;
  return messageFromRow(data);
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
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => onMessage(messageFromRow(payload.new)),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
