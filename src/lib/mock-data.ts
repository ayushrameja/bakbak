import type {
  AppUser,
  Channel,
  ChatMessage,
  Server,
  ServerMember,
  WorkspaceSnapshot,
} from "./types";

export const mockCurrentUser: AppUser = {
  id: "user-ayush",
  displayName: "Ayush",
  email: "ayush@bakbak.local",
  avatarUrl: null,
  status: "online",
};

export const mockServer: Server = {
  id: "server-corner",
  name: "The Corner",
  description: "A small room for big conversations.",
};

export const mockChannels: Channel[] = [
  {
    id: "channel-lobby",
    serverId: mockServer.id,
    name: "lobby",
    kind: "text",
    position: 0,
    topic: "Daily check-ins, tiny wins, and suspiciously long tangents.",
  },
  {
    id: "channel-builds",
    serverId: mockServer.id,
    name: "what-we-are-building",
    kind: "text",
    position: 1,
    topic: "Share the thing before it becomes another forgotten browser tab.",
  },
  {
    id: "channel-random",
    serverId: mockServer.id,
    name: "beautiful-chaos",
    kind: "text",
    position: 2,
    topic: "Context is optional. Kindness is not.",
  },
  {
    id: "voice-cafe",
    serverId: mockServer.id,
    name: "Coffee table",
    kind: "voice",
    position: 3,
    topic: "Drop in, stay awhile.",
  },
  {
    id: "voice-focus",
    serverId: mockServer.id,
    name: "Quiet co-work",
    kind: "voice",
    position: 4,
    topic: "Mostly quiet, occasionally profound.",
  },
];

export const mockMembers: ServerMember[] = [
  { ...mockCurrentUser, role: "admin" },
  {
    id: "user-mira",
    displayName: "Mira",
    email: "mira@bakbak.local",
    avatarUrl: null,
    status: "online",
    role: "member",
  },
  {
    id: "user-jo",
    displayName: "Jo",
    email: "jo@bakbak.local",
    avatarUrl: null,
    status: "idle",
    role: "member",
  },
  {
    id: "user-kabir",
    displayName: "Kabir",
    email: "kabir@bakbak.local",
    avatarUrl: null,
    status: "offline",
    role: "member",
  },
];

const now = Date.now();

export const mockMessages: ChatMessage[] = [
  {
    id: "message-1",
    channelId: "channel-lobby",
    authorId: "user-mira",
    body: "I made tea and accidentally opened the laptop. So I guess we are working now.",
    content: null,
    createdAt: new Date(now - 48 * 60 * 1000).toISOString(),
  },
  {
    id: "message-2",
    channelId: "channel-lobby",
    authorId: "user-ayush",
    body: "That is how most startups begin. Tea, an accident, and poor boundary management.",
    content: null,
    createdAt: new Date(now - 44 * 60 * 1000).toISOString(),
  },
  {
    id: "message-3",
    channelId: "channel-lobby",
    authorId: "user-jo",
    body: "Voice room after lunch? I have gossip with a surprisingly strong architecture diagram.",
    content: null,
    createdAt: new Date(now - 18 * 60 * 1000).toISOString(),
  },
  {
    id: "message-4",
    channelId: "channel-builds",
    authorId: "user-ayush",
    body: "Bakbak has a real shell now. Next milestone: making the mute button more reliable than us.",
    content: null,
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockWorkspace: WorkspaceSnapshot = {
  server: mockServer,
  channels: mockChannels,
  members: mockMembers,
  currentUserRole: "admin",
};
