import type {
  AppUser,
  Channel,
  ChannelCategory,
  ChannelKind,
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
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "Tea, tiny experiments, and conversations that refuse to end.",
  status: "online",
};

export const mockServer: Server = {
  id: "server-corner",
  name: "The Corner",
  description: "A small room for big conversations.",
};

export const mockChannelCategories: ChannelCategory[] = [
  channelCategory("welcome", "Welcome", 10),
  channelCategory("gamez", "Gamez", 20),
  channelCategory("study", "Only Study", 30),
  channelCategory("creators", "Content Creators", 40),
  channelCategory("photos", "Photos", 50),
  channelCategory("software", "Software", 60),
  channelCategory("afk", "AFK", 70),
];

export const mockChannels: Channel[] = [
  mockChannel("spawn", "spawn", "text", "welcome", 10),
  mockChannel("law", "law", "text", "welcome", 20),
  mockChannel("ladder", "ladder", "text", "welcome", 30),
  mockChannel("rant", "rant", "text", "welcome", 40),
  mockChannel("gaane", "gaane", "text", "welcome", 50),
  mockChannel("clips", "clips", "text", "gamez", 10),
  mockChannel("portals", "portals", "text", "gamez", 20),
  mockChannel("vault", "vault", "text", "gamez", 30),
  mockChannel("queue", "Queue", "voice", "gamez", 40),
  mockChannel("crash", "Crash", "voice", "gamez", 50),
  mockChannel("songs-only", "Songs Only", "voice", "gamez", 60),
  mockChannel("why", "why", "text", "study", 10),
  mockChannel("how", "how", "text", "study", 20),
  mockChannel("notes", "notes", "text", "study", 30),
  mockChannel("deadline", "deadline", "text", "study", 40),
  mockChannel("focus", "Focus", "voice", "study", 50),
  mockChannel("loop", "Loop", "voice", "study", 60),
  mockChannel("old-edits", "old-edits", "text", "creators", 10),
  mockChannel("ink", "ink", "text", "creators", 20),
  mockChannel("preparation", "preparation", "text", "creators", 30),
  mockChannel("meme", "meme", "text", "photos", 10),
  mockChannel("wallpapers", "wallpapers", "text", "photos", 20),
  mockChannel("links", "links", "text", "software", 10),
  mockChannel("afk", "AFK", "voice", "afk", 10),
];

export const mockMembers: ServerMember[] = [
  { ...mockCurrentUser, role: "admin" },
  {
    id: "user-mira",
    displayName: "Mira",
    email: "mira@bakbak.local",
    avatarUrl: null,
    avatarAnimationUrl: null,
    avatarPath: null,
    avatarAnimationPath: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description: "Makes things, breaks fewer of them than last year.",
    status: "online",
    role: "member",
  },
  {
    id: "user-jo",
    displayName: "Jo",
    email: "jo@bakbak.local",
    avatarUrl: null,
    avatarAnimationUrl: null,
    avatarPath: null,
    avatarAnimationPath: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description:
      "Currently turning vague ideas into suspiciously specific playlists.",
    status: "idle",
    role: "member",
  },
  {
    id: "user-kabir",
    displayName: "Kabir",
    email: "kabir@bakbak.local",
    avatarUrl: null,
    avatarAnimationUrl: null,
    avatarPath: null,
    avatarAnimationPath: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description: "",
    status: "offline",
    role: "member",
  },
];

const now = Date.now();

export const mockMessages: ChatMessage[] = [
  {
    id: "message-1",
    channelId: "channel-spawn",
    authorId: "user-mira",
    body: "I made tea and accidentally opened the laptop. So I guess we are working now.",
    content: null,
    createdAt: new Date(now - 48 * 60 * 1000).toISOString(),
  },
  {
    id: "message-2",
    channelId: "channel-spawn",
    authorId: "user-ayush",
    body: "That is how most startups begin. Tea, an accident, and poor boundary management.",
    content: null,
    createdAt: new Date(now - 44 * 60 * 1000).toISOString(),
  },
  {
    id: "message-3",
    channelId: "channel-spawn",
    authorId: "user-jo",
    body: "Voice room after lunch? I have gossip with a surprisingly strong architecture diagram.",
    content: null,
    createdAt: new Date(now - 18 * 60 * 1000).toISOString(),
  },
  {
    id: "message-4",
    channelId: "channel-clips",
    authorId: "user-ayush",
    body: "Bakbak has a real shell now. Next milestone: making the mute button more reliable than us.",
    content: null,
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockWorkspace: WorkspaceSnapshot = {
  server: mockServer,
  channelCategories: mockChannelCategories,
  channels: mockChannels,
  members: mockMembers,
  currentUserRole: "admin",
};

function channelCategory(
  id: string,
  name: string,
  position: number,
): ChannelCategory {
  return {
    id: `category-${id}`,
    serverId: mockServer.id,
    name,
    position,
  };
}

function mockChannel(
  id: string,
  name: string,
  kind: ChannelKind,
  categoryId: string,
  position: number,
): Channel {
  return {
    id: `channel-${id}`,
    serverId: mockServer.id,
    categoryId: `category-${categoryId}`,
    name,
    kind,
    position,
    topic:
      kind === "voice"
        ? "Drop in when you feel like talking."
        : "A private conversation for server members.",
  };
}
