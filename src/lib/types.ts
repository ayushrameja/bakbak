export type DataMode = "mock" | "live";
export type ChannelKind = "text" | "voice";
export type MembershipRole = "admin" | "member";

export interface AppUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
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

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: string;
  pending?: boolean;
}

export interface WorkspaceSnapshot {
  server: Server;
  channels: Channel[];
  members: ServerMember[];
}
