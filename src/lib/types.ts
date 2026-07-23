export type DataMode = "mock" | "live";
export type ChannelKind = "text" | "voice";
export type MembershipRole = "admin" | "member";

export interface AppUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  avatarAnimationUrl: string | null;
  avatarPath: string | null;
  avatarAnimationPath: string | null;
  coverUrl: string | null;
  coverAnimationUrl: string | null;
  coverPath: string | null;
  coverAnimationPath: string | null;
  coverPositionX: number;
  coverPositionY: number;
  description: string;
  status: "online" | "idle" | "offline";
}

export interface Server {
  id: string;
  name: string;
  description: string;
}

export interface ChannelCategory {
  id: string;
  serverId: string;
  name: string;
  position: number;
}

export interface Channel {
  id: string;
  serverId: string;
  categoryId: string | null;
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

export type MessageScope = "channel" | "direct";
export type MessageAttachmentKind = "image" | "gif" | "video";
export type GiphyAssetKind = "gif" | "sticker";

export type MessagePresentation =
  | {
      kind: "giphy";
      assetId: string;
      assetKind: GiphyAssetKind;
      title: string;
      altText: string;
      width: number;
      height: number;
    }
  | {
      kind: "sticker";
      stickerId: string;
    };

export interface MessageAttachment {
  id: string;
  kind: MessageAttachmentKind;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  durationMs: number | null;
  objectPath: string;
  posterPath: string;
  objectUrl?: string | null;
  posterUrl?: string | null;
  uploadProgress?: number;
}

export interface StagedMessageAttachment {
  id: string;
  kind: MessageAttachmentKind;
  file: File;
  poster: Blob;
  width: number;
  height: number;
  durationMs: number | null;
  previewUrl: string;
  progress: number;
  status: "ready" | "uploading" | "failed";
  error?: string;
}

export interface MessageReplyPreview {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  deleted: boolean;
}

export interface Sticker {
  id: string;
  serverId: string;
  label: string;
  posterPath: string;
  animationPath: string | null;
  width: number;
  height: number;
  createdBy: string;
  enabled: boolean;
  createdAt: string;
  posterUrl?: string | null;
  animationUrl?: string | null;
}

export interface StickerReaction {
  stickerId: string;
  userIds: string[];
  count: number;
  reactedByCurrentUser: boolean;
}

export interface DraftMention {
  userId: string;
  fallback: string;
  start: number;
  end: number;
}

export interface MessageDraft {
  text: string;
  mentions: DraftMention[];
  attachments?: StagedMessageAttachment[];
  replyTo?: MessageReplyPreview | null;
  notifyReplyAuthor?: boolean;
  presentation?: MessagePresentation | null;
}

export interface ConversationMessage {
  id: string;
  authorId: string;
  body: string;
  content: MessageSegment[] | null;
  createdAt: string;
  presentation?: MessagePresentation | null;
  attachments?: MessageAttachment[];
  reply?: MessageReplyPreview | null;
  replyNotifiesAuthor?: boolean;
  notifiesCurrentUser?: boolean;
  reactions?: StickerReaction[];
  deletedAt?: string | null;
  pending?: boolean;
}

export interface MessageCursor {
  createdAt: string;
  id: string;
}

export interface ChatMessage extends ConversationMessage {
  channelId: string;
}

export interface DirectMessage extends ConversationMessage {
  conversationId: string;
}

export interface DirectConversation {
  id: string;
  otherMember: ServerMember;
  createdAt: string;
  updatedAt: string;
  latestMessageId: string | null;
  latestMessageAuthorId: string | null;
  latestMessageBody: string | null;
  latestMessageCreatedAt: string | null;
  hasUnread: boolean;
}

export type ConversationTarget =
  | {
      kind: "channel";
      id: string;
      name: string;
      topic: string;
    }
  | {
      kind: "direct";
      id: string;
      member: ServerMember;
    };

export interface ChannelActivity {
  channelId: string;
  latestMessageId: string | null;
  lastReadMessageId: string | null;
  hasUnread: boolean;
}

export interface WorkspaceSnapshot {
  server: Server;
  channelCategories: ChannelCategory[];
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
  isStreaming: boolean;
}
