import type {
  AppUser,
  Channel,
  ChannelCategory,
  ChannelKind,
  ChannelPurpose,
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
  avatarGiphyId: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverGiphyId: null,
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
  channelCategory("channels", "Channels", 100),
];

export const mockChannels: Channel[] = [
  mockChannel("welcome", "Welcome", "text", "channels", 100, "system-general"),
  mockChannel("chat", "Chat", "text", "channels", 200),
  mockChannel("volt", "Volt", "text", "channels", 300),
  mockChannel("random-things", "Random Things", "text", "channels", 400),
  mockChannel("game-1", "Game #1", "voice", "channels", 1100),
  mockChannel("game-2", "Game #2", "voice", "channels", 1200),
  mockChannel("game-3", "Game #3", "voice", "channels", 1300),
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
    avatarGiphyId: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverGiphyId: null,
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
    avatarGiphyId: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverGiphyId: null,
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
    avatarGiphyId: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverGiphyId: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description: "",
    status: "offline",
    role: "member",
  },
  {
    id: "user-nisha",
    displayName: "Nisha",
    email: "nisha@bakbak.local",
    avatarUrl: null,
    avatarAnimationUrl: null,
    avatarPath: null,
    avatarAnimationPath: null,
    avatarGiphyId: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverGiphyId: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description: "Has excellent timing and suspiciously good snack opinions.",
    status: "online",
    role: "member",
  },
  {
    id: "user-ravi",
    displayName: "Ravi",
    email: "ravi@bakbak.local",
    avatarUrl: null,
    avatarAnimationUrl: null,
    avatarPath: null,
    avatarAnimationPath: null,
    avatarGiphyId: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverGiphyId: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description: "Usually away, never actually away from the conversation.",
    status: "idle",
    role: "member",
  },
  {
    id: "user-zara",
    displayName: "Zara",
    email: "zara@bakbak.local",
    avatarUrl: null,
    avatarAnimationUrl: null,
    avatarPath: null,
    avatarAnimationPath: null,
    avatarGiphyId: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverGiphyId: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description: "Offline by choice. The best kind of notification settings.",
    status: "offline",
    role: "member",
  },
];

export const mockMessages: ChatMessage[] = [];

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
  purpose: ChannelPurpose = "chat",
): Channel {
  return {
    id: `channel-${id}`,
    serverId: mockServer.id,
    categoryId: `category-${categoryId}`,
    name,
    kind,
    purpose,
    position,
    topic:
      purpose === "system-releases"
        ? "Published Bakbak releases and their notes."
        : purpose === "system-general"
          ? "Automatic welcomes for friends joining Bakbak."
          : kind === "voice"
            ? "Drop in when you feel like talking."
            : "A private conversation for server members.",
  };
}
