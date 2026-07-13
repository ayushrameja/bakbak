export type DataMode = "mock" | "live";
export type ChannelKind = "text" | "voice";
export type MembershipRole = "admin" | "member";

export interface AppUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  avatarPath?: string | null;
  status: "online" | "idle" | "offline";
}

export interface Server {
  id: string;
  name: string;
  description: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  kind: ChannelKind;
  position: number;
  topic: string;
}

export interface ServerMember extends AppUser {
  role: MembershipRole;
}

export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "mention"; userId: string; fallback: string };

export interface DraftMention {
  userId: string;
  fallback: string;
  start: number;
  end: number;
}

export interface MessageDraft {
  text: string;
  mentions: DraftMention[];
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  content: MessageSegment[] | null;
  createdAt: string;
  pending?: boolean;
}

export interface ChannelActivity {
  channelId: string;
  latestMessageId: string | null;
  lastReadMessageId: string | null;
  hasUnread: boolean;
}

export interface WorkspaceSnapshot {
  server: Server;
  channels: Channel[];
  members: ServerMember[];
  currentUserRole: MembershipRole;
}

export interface VoiceRoomOccupant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  channelId: string;
  joinedAt: string;
}
