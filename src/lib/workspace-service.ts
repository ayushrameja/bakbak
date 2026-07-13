import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type {
  AppUser,
  Channel,
  ChatMessage,
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
}

interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
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
    .select("id,display_name,avatar_url,avatar_path")
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
      avatarPath: profile?.avatar_path ?? null,
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
    .select("id,channel_id,author_id,body,created_at")
    .eq("channel_id", channelId)
    .order("created_at")
    .limit(200)
    .returns<MessageRow[]>();
  if (error) throw error;
  return data.map(messageFromRow);
}

export async function sendLiveMessage(
  channelId: string,
  body: string,
): Promise<ChatMessage> {
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .insert({ channel_id: channelId, body: body.trim() })
    .select("id,channel_id,author_id,body,created_at")
    .single<MessageRow>();
  if (error) throw error;
  return messageFromRow(data);
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
