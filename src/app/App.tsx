import { CircleAlert, Hash, Volume2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Avatar } from "../components/Avatar";
import { BakbakMark } from "../components/BakbakMark";
import { LoadingScreen } from "../components/LoadingScreen";
import { PanelResizer } from "../components/PanelResizer";
import { ProfilePopover } from "../components/ProfilePopover";
import type {
  LoadProfileMedia,
  OpenProfile,
} from "../components/ProfileTrigger";
import {
  UserContextMenu,
  type OpenUserContextMenu,
  type UserContextMenuRequest,
} from "../components/UserContextMenu";
import { WindowTitlebar } from "../components/WindowTitlebar";
import { AuthScreen } from "../features/auth/AuthScreen";
import { InviteGate } from "../features/auth/InviteGate";
import { ChannelDialog } from "../features/channels/ChannelDialog";
import { ChannelSidebar } from "../features/channels/ChannelSidebar";
import {
  markChannelRead,
  shouldPlayIncomingMessageSound,
  unreadChannelsAfterMessage,
} from "../features/chat/channel-activity";
import { ChatView, ConversationView } from "../features/chat/ChatView";
import { DirectPersonPanel } from "../features/chat/DirectPersonPanel";
import { PersonalSidebar } from "../features/chat/PersonalSidebar";
import { hydrateDirectConversationAvatars } from "../features/chat/direct-conversation-media";
import {
  draftToSegments,
  EMPTY_MESSAGE_DRAFT,
  segmentsToFallback,
} from "../features/chat/message-content";
import { prepareStickerUpload } from "../features/chat/message-media";
import {
  MemberPanel,
  type MemberVoiceActivity,
} from "../features/server/MemberPanel";
import type { AppSpace } from "../features/server/app-space";
import {
  applyAppearancePreference,
  loadAppearancePreference,
  saveAppearancePreference,
  type AppearancePreference,
} from "../features/settings/appearance-preferences";
import {
  loadInterfaceSoundPreferences,
  saveInterfaceSoundPreferences,
  type InterfaceSoundPreferences,
} from "../features/settings/interface-sound-preferences";
import { interfaceSoundController } from "../features/settings/interface-sounds";
import {
  loadLayoutPreferences,
  DEFAULT_CONTEXT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  MAX_SIDE_PANEL_WIDTH,
  MIN_CONTENT_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  saveLayoutPreferences,
  type LayoutPreferences,
} from "../features/settings/layout-preferences";
import {
  SettingsPage,
  type ProfileSaveInput,
  type SettingsSection,
} from "../features/settings/SettingsPage";
import {
  getCurrentSystemAccent,
  subscribeSystemAccent,
  type AppliedSystemAccent,
} from "../features/settings/system-accent";
import { Soundboard } from "../features/soundboard/Soundboard";
import {
  shouldDismissSoundboardForEscape,
  shouldDismissSoundboardForPointer,
} from "../features/soundboard/soundboard-dismissal";
import { useSoundboardCatalog } from "../features/soundboard/useSoundboardCatalog";
import { ScreenShareDialog } from "../features/voice/ScreenShareDialog";
import { VoiceControlDock } from "../features/voice/VoiceControlDock";
import {
  VoiceRoom,
  type StreamWatchRequest,
} from "../features/voice/VoiceRoom";
import { useVoiceRoom } from "../features/voice/useVoiceRoom";
import {
  prewarmMicrophoneProcessing,
  releaseMicrophoneProcessing,
} from "../features/voice/microphone-processing";
import { sessionToAppUser, signOut } from "../lib/auth-service";
import { useAutoHideScrollbars } from "../lib/use-auto-hide-scrollbars";
import type { CommunicationEffectEvent } from "../lib/communication-effects";
import { isConnectivityError } from "../lib/connectivity";
import {
  createLiveChannel,
  reconcileChannelCategories,
  reconcileChannels,
  renameLiveChannel,
  subscribeToLiveChannelCategories,
  subscribeToLiveChannels,
} from "../lib/channel-service";
import { appConfig } from "../lib/env";
import {
  BakbakCache,
  MAX_CACHED_MESSAGES_PER_THREAD,
  mergeMessages,
  type CacheStats,
  type CachedDestination,
  type DataFreshness,
} from "../lib/local-cache";
import {
  requestLinkPreview,
  shouldRequestLinkPreview,
} from "../lib/link-preview";
import {
  getOrCreateDirectConversation,
  loadDirectConversations,
  loadDirectMessages,
  loadDirectMessageById,
  markDirectConversationRead,
  sendDirectMessage,
  subscribeToDirectMessages,
  subscribeToDirectReadStates,
} from "../lib/direct-message-service";
import {
  cleanupStaleMessageAttachments,
  deleteRichMessage,
  uploadMessageAttachments,
} from "../lib/message-media-service";
import { mockCurrentUser, mockMessages, mockWorkspace } from "../lib/mock-data";
import { getSupabaseClient } from "../lib/supabase";
import {
  AVATAR_BUCKET,
  COVER_BUCKET,
  prepareProfileImage,
  saveLiveProfile,
  subscribeToProfileChanges,
  type ProfileRow,
} from "../lib/profile-service";
import { ProfileMediaCache } from "../lib/profile-media-cache";
import {
  archiveSticker,
  downloadStickerMedia,
  loadStickers,
  subscribeToStickerReactions,
  subscribeToStickers,
  toggleStickerReaction,
  uploadSticker,
} from "../lib/sticker-service";
import {
  subscribeToServerPresence,
  type ServerPresenceSubscription,
  type VoicePresenceSession,
} from "../lib/presence-service";
import type {
  AppUser,
  Channel,
  ChannelKind,
  ChatMessage,
  ConversationMessage,
  DirectConversation,
  DirectMessage,
  MessageAttachment,
  MessageDraft,
  ServerMember,
  Sticker,
  WorkspaceSnapshot,
  VoiceRoomOccupant,
} from "../lib/types";
import {
  loadLiveChannelActivity,
  loadLiveMessageById,
  loadLiveMessages,
  loadLiveWorkspace,
  markLiveChannelRead,
  MissingMembershipError,
  sendLiveMessage,
  subscribeToLiveMessages,
  subscribeToLiveReadStates,
} from "../lib/workspace-service";

type AppView = "channel" | "settings";
type ChannelDialogState =
  | { mode: "create"; kind: ChannelKind }
  | { mode: "rename"; channel: Channel }
  | null;
interface OpenProfileState {
  memberId: string;
  anchor: HTMLElement;
}

const localCache = new BakbakCache();

function draftFallbackBody(draft: MessageDraft): string {
  const text = segmentsToFallback(draftToSegments(draft));
  if (text) return text;
  const firstAttachment = draft.attachments?.[0];
  if (firstAttachment) {
    if (firstAttachment.kind === "video") return "[Video]";
    if (firstAttachment.kind === "gif") return "[GIF]";
    return "[Image]";
  }
  if (draft.presentation?.kind === "giphy") {
    return draft.presentation.assetKind === "sticker" ? "[Sticker]" : "[GIF]";
  }
  if (draft.presentation?.kind === "sticker") return "[Sticker]";
  return "";
}

function optimisticAttachments(draft: MessageDraft): MessageAttachment[] {
  return (draft.attachments ?? []).map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.file.type,
    byteSize: attachment.file.size,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    objectPath: "",
    posterPath: "",
    objectUrl: attachment.previewUrl,
    posterUrl: attachment.previewUrl,
    uploadProgress: attachment.progress,
  }));
}

function toggleMockReaction<T extends ConversationMessage>(
  messages: T[],
  messageId: string,
  stickerId: string,
  userId: string,
): T[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const existing = message.reactions?.find(
      (reaction) => reaction.stickerId === stickerId,
    );
    const userIds = existing?.userIds.includes(userId)
      ? existing.userIds.filter((id) => id !== userId)
      : [...(existing?.userIds ?? []), userId];
    const reactions = [
      ...(message.reactions ?? []).filter(
        (reaction) => reaction.stickerId !== stickerId,
      ),
      ...(userIds.length
        ? [
            {
              stickerId,
              userIds,
              count: userIds.length,
              reactedByCurrentUser: userIds.includes(userId),
            },
          ]
        : []),
    ];
    return { ...message, reactions };
  });
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(appConfig.dataMode === "live");
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [activeSpace, setActiveSpace] = useState<AppSpace>("server");
  const [directConversations, setDirectConversations] = useState<
    DirectConversation[]
  >([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [directDrafts, setDirectDrafts] = useState<
    Record<string, MessageDraft>
  >({});
  const [directSending, setDirectSending] = useState(false);
  const [directHistoryLoading, setDirectHistoryLoading] = useState(true);
  const [inviteGateOpen, setInviteGateOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [sending, setSending] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("channel");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("profile");
  const [appearancePreference, setAppearancePreference] =
    useState<AppearancePreference>(() => loadAppearancePreference());
  const [systemAccent, setSystemAccent] = useState<AppliedSystemAccent>(() =>
    getCurrentSystemAccent(),
  );
  const [interfaceSoundPreferences, setInterfaceSoundPreferences] =
    useState<InterfaceSoundPreferences>(() => loadInterfaceSoundPreferences());
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(
    () => loadLayoutPreferences(),
  );
  const [spaceTransitionRevision, setSpaceTransitionRevision] = useState(0);
  const [startupAssembly, setStartupAssembly] = useState<
    "pending" | "running" | "complete"
  >("pending");
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const soundboardDrawerRef = useRef<HTMLElement>(null);
  const [channelDialog, setChannelDialog] = useState<ChannelDialogState>(null);
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const [screenShareDialogOpen, setScreenShareDialogOpen] = useState(false);
  const [openProfile, setOpenProfile] = useState<OpenProfileState | null>(null);
  const [userContextMenu, setUserContextMenu] =
    useState<UserContextMenuRequest | null>(null);
  const [streamWatchRequest, setStreamWatchRequest] =
    useState<StreamWatchRequest | null>(null);
  const streamWatchSequenceRef = useRef(0);
  const [needsInvite, setNeedsInvite] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [unreadChannelIds, setUnreadChannelIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [latestMessageIds, setLatestMessageIds] = useState<
    Record<string, string | null>
  >({});
  const [voiceSessions, setVoiceSessions] = useState<VoicePresenceSession[]>(
    [],
  );
  const [dataFreshness, setDataFreshness] = useState<DataFreshness>(
    appConfig.dataMode === "mock" ? "fresh" : "loading",
  );
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    messageBytes: 0,
    messageCount: 0,
    profileMediaBytes: 0,
    profileMediaCount: 0,
    messageMediaBytes: 0,
    messageMediaCount: 0,
    totalBytes: 0,
  });
  const selectedChannelIdRef = useRef(selectedChannelId);
  const selectedConversationIdRef = useRef(selectedConversationId);
  const activeViewRef = useRef(activeView);
  const activeSpaceRef = useRef(activeSpace);
  const presenceSubscriptionRef = useRef<ServerPresenceSubscription | null>(
    null,
  );
  const avatarObjectUrlsRef = useRef(new Map<string, string>());
  const stickerObjectUrlsRef = useRef(new Map<string, string[]>());
  const offlineStickerHydrationAttemptsRef = useRef(new Set<string>());
  const uploadAbortControllersRef = useRef(new Map<string, AbortController>());
  const linkPreviewAttemptsRef = useRef(new Set<string>());
  const profileMediaCacheRef = useRef(new ProfileMediaCache(localCache));
  const profileUpdateSequenceRef = useRef(new Map<string, number>());
  const voiceDeafenedRef = useRef(false);
  const cachedAccountReadyRef = useRef<string | null>(null);
  const lastDestinationRef = useRef<CachedDestination | null>(null);
  const channelThreadsRef = useRef(new Map<string, ChatMessage[]>());
  const directThreadsRef = useRef(new Map<string, DirectMessage[]>());
  const signedInUserId = user?.id;
  const signedInUserEmail = user?.email ?? "";
  const workspaceServerId = workspace?.server.id;
  const soundboard = useSoundboardCatalog(
    workspaceServerId,
    signedInUserId,
    appConfig.dataMode,
  );
  const handleCommunicationEffect = useCallback(
    (event: CommunicationEffectEvent) => {
      interfaceSoundController.play(event, {
        deafened: voiceDeafenedRef.current,
      });
    },
    [],
  );
  const voice = useVoiceRoom(
    user ?? mockCurrentUser,
    appConfig.dataMode,
    soundboard,
    handleCommunicationEffect,
  );
  useAutoHideScrollbars();

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    voiceDeafenedRef.current = voice.deafened;
  }, [voice.deafened]);

  useEffect(() => {
    linkPreviewAttemptsRef.current.clear();
  }, [signedInUserId]);

  useEffect(() => {
    interfaceSoundController.setPreferences(interfaceSoundPreferences);
  }, [interfaceSoundPreferences]);

  useEffect(() => subscribeSystemAccent(setSystemAccent), []);

  const rememberAvatarUrl = useCallback(
    (userId: string, url: string | null) => {
      const previous = avatarObjectUrlsRef.current.get(userId);
      if (previous && previous !== url) URL.revokeObjectURL(previous);
      if (url?.startsWith("blob:"))
        avatarObjectUrlsRef.current.set(userId, url);
      else avatarObjectUrlsRef.current.delete(userId);
    },
    [],
  );
  const loadProfileMedia = useCallback<LoadProfileMedia>(
    (bucket, path, options) =>
      profileMediaCacheRef.current.load(bucket, path, options),
    [],
  );
  const updateChannelThread = useCallback(
    (
      channelId: string,
      update: (current: ChatMessage[]) => ChatMessage[],
      persist = true,
    ) => {
      const next = update(channelThreadsRef.current.get(channelId) ?? []);
      channelThreadsRef.current.set(channelId, next);
      if (selectedChannelIdRef.current === channelId) setMessages(next);
      if (persist && signedInUserId && appConfig.dataMode === "live") {
        void localCache.writeThread(signedInUserId, "channel", channelId, next);
      }
      return next;
    },
    [signedInUserId],
  );
  const updateDirectThread = useCallback(
    (
      conversationId: string,
      update: (current: DirectMessage[]) => DirectMessage[],
      persist = true,
    ) => {
      const next = update(directThreadsRef.current.get(conversationId) ?? []);
      directThreadsRef.current.set(conversationId, next);
      if (selectedConversationIdRef.current === conversationId) {
        setDirectMessages(next);
      }
      if (persist && signedInUserId && appConfig.dataMode === "live") {
        void localCache.writeThread(
          signedInUserId,
          "direct",
          conversationId,
          next,
        );
      }
      return next;
    },
    [signedInUserId],
  );
  const handleOpenProfile = useCallback<OpenProfile>((member, anchor) => {
    setUserContextMenu(null);
    setOpenProfile({ memberId: member.id, anchor });
  }, []);
  const handleOpenUserContextMenu = useCallback<OpenUserContextMenu>(
    (member, anchor, point) => {
      const rect = anchor.getBoundingClientRect();
      setOpenProfile(null);
      setUserContextMenu({
        member,
        anchor,
        clientX: point?.clientX ?? rect.left,
        clientY: point?.clientY ?? rect.bottom,
      });
    },
    [],
  );

  useEffect(
    () => () => {
      avatarObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      avatarObjectUrlsRef.current.clear();
      profileMediaCacheRef.current.clear();
      profileUpdateSequenceRef.current.clear();
      void releaseMicrophoneProcessing();
    },
    [],
  );

  useEffect(() => {
    const enable = () => {
      void interfaceSoundController.activate();
      if (voice.enhancedNoiseSuppression || voice.voiceEffect !== "none") {
        void prewarmMicrophoneProcessing();
      }
    };
    window.addEventListener("pointerdown", enable, { once: true });
    window.addEventListener("keydown", enable, { once: true });
    return () => {
      window.removeEventListener("pointerdown", enable);
      window.removeEventListener("keydown", enable);
    };
  }, [voice.enhancedNoiseSuppression, voice.voiceEffect]);

  useEffect(() => {
    if (appConfig.dataMode !== "live") {
      setAuthLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session ? sessionToAppUser(data.session) : null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((current) => {
        if (!session) return null;
        const next = sessionToAppUser(session);
        return current?.id === next.id
          ? {
              ...next,
              displayName: current.displayName,
              avatarUrl: current.avatarUrl,
              avatarAnimationUrl: current.avatarAnimationUrl,
              avatarPath: current.avatarPath,
              avatarAnimationPath: current.avatarAnimationPath,
              coverUrl: current.coverUrl,
              coverAnimationUrl: current.coverAnimationUrl,
              coverPath: current.coverPath,
              coverAnimationPath: current.coverAnimationPath,
              coverPositionX: current.coverPositionX,
              coverPositionY: current.coverPositionY,
              description: current.description,
            }
          : next;
      });
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedInUserId) {
      avatarObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      avatarObjectUrlsRef.current.clear();
      profileMediaCacheRef.current.setAccount(null);
      cachedAccountReadyRef.current = null;
      lastDestinationRef.current = null;
      channelThreadsRef.current.clear();
      directThreadsRef.current.clear();
      setWorkspace(null);
      setNeedsInvite(false);
      setSelectedChannelId("");
      setActiveSpace("server");
      setDirectConversations([]);
      setDirectHistoryLoading(true);
      setInviteGateOpen(false);
      setSelectedConversationId(null);
      setDirectMessages([]);
      setDirectDrafts({});
      setMessages([]);
      setDrafts({});
      setUnreadChannelIds(new Set());
      setLatestMessageIds({});
      setVoiceSessions([]);
      setActiveView("channel");
      setOpenProfile(null);
      setSoundboardOpen(false);
      setDataFreshness(appConfig.dataMode === "mock" ? "fresh" : "loading");
      setCacheStats({
        messageBytes: 0,
        messageCount: 0,
        profileMediaBytes: 0,
        profileMediaCount: 0,
        messageMediaBytes: 0,
        messageMediaCount: 0,
        totalBytes: 0,
      });
      return;
    }
    if (
      cachedAccountReadyRef.current &&
      cachedAccountReadyRef.current !== signedInUserId
    ) {
      cachedAccountReadyRef.current = null;
      lastDestinationRef.current = null;
      channelThreadsRef.current.clear();
      directThreadsRef.current.clear();
      setMessages([]);
      setDirectMessages([]);
      setWorkspace(null);
      setDirectConversations([]);
    }
    profileMediaCacheRef.current.setAccount(signedInUserId);
    let cancelled = false;
    setAppError(null);
    setDataFreshness(appConfig.dataMode === "mock" ? "fresh" : "loading");

    const applyCurrentMember = (snapshot: WorkspaceSnapshot) => {
      const currentMember = snapshot.members.find(
        (member) => member.id === signedInUserId,
      );
      if (!currentMember) return;
      setUser((current) =>
        !current || current.id !== currentMember.id
          ? current
          : {
              ...current,
              displayName: currentMember.displayName,
              avatarUrl: currentMember.avatarUrl,
              avatarPath: currentMember.avatarPath,
              avatarAnimationPath: currentMember.avatarAnimationPath,
              coverPath: currentMember.coverPath,
              coverAnimationPath: currentMember.coverAnimationPath,
              coverPositionX: currentMember.coverPositionX,
              coverPositionY: currentMember.coverPositionY,
              description: currentMember.description,
            },
      );
    };

    const hydrateAvatars = (snapshot: WorkspaceSnapshot) => {
      snapshot.members.forEach((member) => {
        if (!member.avatarPath || member.avatarUrl) return;
        void loadProfileMedia(AVATAR_BUCKET, member.avatarPath)
          .then((avatarUrl) => {
            if (cancelled || !avatarUrl) return;
            setWorkspace((current) =>
              current?.server.id === snapshot.server.id
                ? {
                    ...current,
                    members: current.members.map((candidate) =>
                      candidate.id === member.id &&
                      candidate.avatarPath === member.avatarPath
                        ? { ...candidate, avatarUrl }
                        : candidate,
                    ),
                  }
                : current,
            );
            if (member.id === signedInUserId) {
              setUser((current) =>
                current?.id === member.id &&
                current.avatarPath === member.avatarPath
                  ? { ...current, avatarUrl }
                  : current,
              );
            }
          })
          .catch(() => undefined);
      });
    };

    const load = async () => {
      let restoredCache = false;
      let restoredWorkspace: WorkspaceSnapshot | null = null;
      let restoredDirectConversations: DirectConversation[] = [];
      try {
        if (appConfig.dataMode === "live") {
          const cached = await localCache.readAccountState(signedInUserId);
          if (cancelled) return;
          cachedAccountReadyRef.current = signedInUserId;
          if (
            cached &&
            (cached.workspace || cached.directConversations.length)
          ) {
            restoredCache = true;
            restoredWorkspace = cached.workspace;
            restoredDirectConversations = cached.directConversations;
            lastDestinationRef.current = cached.lastDestination;
            setWorkspace(cached.workspace);
            setDirectConversations(cached.directConversations);
            setStickers(cached.stickers ?? []);
            setDirectHistoryLoading(false);
            if (cached.workspace) applyCurrentMember(cached.workspace);
            const destination = cached.lastDestination;
            if (
              destination?.kind === "direct" &&
              cached.directConversations.some(
                (conversation) => conversation.id === destination.id,
              )
            ) {
              selectedConversationIdRef.current = destination.id;
              setSelectedConversationId(destination.id);
              setActiveSpace("personal");
            } else if (
              destination?.kind === "channel" &&
              cached.workspace?.channels.some(
                (channel) =>
                  channel.id === destination.id && channel.kind === "text",
              )
            ) {
              selectedChannelIdRef.current = destination.id;
              setSelectedChannelId(destination.id);
              setActiveSpace("server");
            }
            setDataFreshness("cached");
            if (cached.workspace) hydrateAvatars(cached.workspace);
          }
        }

        const snapshot =
          appConfig.dataMode === "mock"
            ? mockWorkspace
            : await loadLiveWorkspace({
                id: signedInUserId,
                email: signedInUserEmail,
              });
        if (cancelled) return;
        setWorkspace(snapshot);
        applyCurrentMember(snapshot);
        hydrateAvatars(snapshot);
        setNeedsInvite(false);
        setDataFreshness("fresh");
        setSelectedChannelId(
          (current) =>
            snapshot.channels.find((channel) => channel.id === current)?.id ??
            snapshot.channels.find(
              (channel) =>
                channel.kind === "text" &&
                (channel.purpose ?? "chat") === "chat",
            )?.id ??
            snapshot.channels.find((channel) => channel.kind === "text")?.id ??
            snapshot.channels[0]?.id ??
            "",
        );
      } catch (caught) {
        if (!cancelled) {
          const missingMembership = caught instanceof MissingMembershipError;
          setNeedsInvite(missingMembership);
          if (missingMembership) {
            const retainedMembers = [
              ...(restoredWorkspace?.members.filter(
                (member) => member.id === signedInUserId,
              ) ?? []),
              ...restoredDirectConversations.map(
                (conversation) => conversation.otherMember,
              ),
            ];
            await Promise.all([
              ...(restoredWorkspace?.channels.map((channel) =>
                localCache.deleteThread(signedInUserId, "channel", channel.id),
              ) ?? []),
              localCache.retainProfileMedia(
                signedInUserId,
                retainedMembers.flatMap((member) => [
                  { bucket: AVATAR_BUCKET, path: member.avatarPath },
                  {
                    bucket: AVATAR_BUCKET,
                    path: member.avatarAnimationPath,
                  },
                  { bucket: COVER_BUCKET, path: member.coverPath },
                  {
                    bucket: COVER_BUCKET,
                    path: member.coverAnimationPath,
                  },
                ]),
              ),
            ]);
            profileMediaCacheRef.current.clear();
            setWorkspace(null);
            setSelectedChannelId("");
            setDataFreshness("fresh");
          } else if (restoredCache && isConnectivityError(caught)) {
            setDataFreshness("offline");
            setAppError(null);
            return;
          }
          setAppError(
            caught instanceof Error
              ? caught.message
              : "Bakbak could not load this room.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadProfileMedia, signedInUserEmail, signedInUserId, workspaceRevision]);

  const refreshDirectConversations = useCallback(async () => {
    if (!signedInUserId) return;
    try {
      const conversations =
        appConfig.dataMode === "mock" ? [] : await loadDirectConversations();
      const mergeStatuses = (
        nextConversations: DirectConversation[],
        current: DirectConversation[],
      ) => {
        const statuses = new Map(
          current.map((conversation) => [
            conversation.otherMember.id,
            conversation.otherMember.status,
          ]),
        );
        return nextConversations.map((conversation) => ({
          ...conversation,
          otherMember: {
            ...conversation.otherMember,
            status:
              workspace?.members.find(
                (member) => member.id === conversation.otherMember.id,
              )?.status ??
              statuses.get(conversation.otherMember.id) ??
              conversation.otherMember.status,
            role:
              workspace?.members.find(
                (member) => member.id === conversation.otherMember.id,
              )?.role ?? conversation.otherMember.role,
          },
        }));
      };
      setDirectConversations((current) =>
        mergeStatuses(conversations, current),
      );
      setSelectedConversationId((current) =>
        conversations.some((conversation) => conversation.id === current)
          ? current
          : (conversations[0]?.id ?? null),
      );
      void hydrateDirectConversationAvatars(
        conversations,
        workspace?.members ?? [],
        loadProfileMedia,
      ).then((hydrated) =>
        setDirectConversations((current) => mergeStatuses(hydrated, current)),
      );
    } finally {
      setDirectHistoryLoading(false);
    }
  }, [loadProfileMedia, signedInUserId, workspace]);

  useEffect(() => {
    if (!signedInUserId) return;
    void refreshDirectConversations().catch(() => undefined);
  }, [refreshDirectConversations, signedInUserId, workspaceRevision]);

  useEffect(() => {
    if (needsInvite && directConversations.length > 0) {
      setActiveSpace("personal");
      setAppError(null);
    }
  }, [directConversations.length, needsInvite]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !signedInUserId) return;
    const unsubscribeMessages = subscribeToDirectMessages((message) => {
      const selected =
        message.conversationId === selectedConversationIdRef.current;
      const visible =
        selected &&
        activeSpaceRef.current === "personal" &&
        activeViewRef.current === "channel";
      let isNewMessage = false;
      updateDirectThread(message.conversationId, (current) => {
        isNewMessage = !current.some((item) => item.id === message.id);
        return mergeMessages(current, [message]);
      });
      if (!isNewMessage) return;
      if (visible) {
        void markDirectConversationRead(
          message.conversationId,
          message.id,
        ).catch(() => undefined);
      }
      if (message.authorId !== signedInUserId) {
        handleCommunicationEffect({ type: "message-received" });
      }
      void refreshDirectConversations().catch(() => undefined);
    });
    const unsubscribeReads = subscribeToDirectReadStates(
      signedInUserId,
      () => void refreshDirectConversations().catch(() => undefined),
    );
    return () => {
      unsubscribeMessages();
      unsubscribeReads();
    };
  }, [
    handleCommunicationEffect,
    refreshDirectConversations,
    signedInUserId,
    updateDirectThread,
  ]);

  useEffect(() => {
    if (
      appConfig.dataMode !== "live" ||
      !signedInUserId ||
      !workspaceServerId
    ) {
      return;
    }

    const subscription = subscribeToServerPresence({
      serverId: workspaceServerId,
      userId: signedInUserId,
      onSync: ({ onlineUserIds, voiceSessions: nextVoiceSessions }) => {
        setAppError((current) =>
          current?.startsWith("Online status") ||
          current?.startsWith("Voice-room activity") ||
          current?.startsWith("Live online-status")
            ? null
            : current,
        );
        setVoiceSessions([...nextVoiceSessions]);
        setDirectConversations((current) =>
          current.map((conversation) => ({
            ...conversation,
            otherMember: {
              ...conversation.otherMember,
              status: onlineUserIds.has(conversation.otherMember.id)
                ? "online"
                : "offline",
            },
          })),
        );
        setWorkspace((current) => {
          if (!current || current.server.id !== workspaceServerId)
            return current;
          const members = current.members.map((member) => ({
            ...member,
            status:
              member.id === signedInUserId || onlineUserIds.has(member.id)
                ? ("online" as const)
                : ("offline" as const),
          }));
          return { ...current, members };
        });
      },
      onError: setAppError,
    });
    presenceSubscriptionRef.current = subscription;
    return () => {
      if (presenceSubscriptionRef.current === subscription) {
        presenceSubscriptionRef.current = null;
      }
      subscription.stop();
    };
  }, [signedInUserId, workspaceServerId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !workspaceServerId) return;
    let cancelled = false;
    const unsubscribe = subscribeToProfileChanges((profile) => {
      const sequence =
        (profileUpdateSequenceRef.current.get(profile.id) ?? 0) + 1;
      profileUpdateSequenceRef.current.set(profile.id, sequence);
      void (async () => {
        let avatarUrl = profile.avatar_url;
        let avatarResolved = true;
        try {
          avatarUrl = profile.avatar_path
            ? await loadProfileMedia(AVATAR_BUCKET, profile.avatar_path)
            : profile.avatar_url;
        } catch {
          // Keep the last usable avatar if a transient Storage read fails.
          avatarResolved = false;
        }
        if (
          cancelled ||
          profileUpdateSequenceRef.current.get(profile.id) !== sequence
        ) {
          return;
        }
        setWorkspace((current) =>
          current
            ? {
                ...current,
                members: current.members.map((member) =>
                  member.id === profile.id
                    ? richMemberFromProfile(member, profile, {
                        avatarUrl,
                        avatarResolved,
                        mediaCache: profileMediaCacheRef.current,
                      })
                    : member,
                ),
              }
            : current,
        );
        setUser((current) =>
          current?.id === profile.id
            ? {
                ...current,
                displayName: profile.display_name,
                avatarPath: profile.avatar_path,
                avatarAnimationPath: profile.avatar_animation_path,
                avatarAnimationUrl:
                  current.avatarAnimationPath === profile.avatar_animation_path
                    ? current.avatarAnimationUrl
                    : null,
                coverPath: profile.cover_path,
                coverUrl:
                  current.coverPath === profile.cover_path
                    ? current.coverUrl
                    : null,
                coverAnimationPath: profile.cover_animation_path,
                coverAnimationUrl:
                  current.coverAnimationPath === profile.cover_animation_path
                    ? current.coverAnimationUrl
                    : null,
                coverPositionX: profile.cover_position_x,
                coverPositionY: profile.cover_position_y,
                description: profile.description,
                avatarUrl: avatarResolved ? avatarUrl : current.avatarUrl,
              }
            : current,
        );
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadProfileMedia, workspaceServerId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !workspaceServerId) return;
    const unsubscribeChannels = subscribeToLiveChannels(
      workspaceServerId,
      (channel) => {
        setWorkspace((current) =>
          current && current.server.id === workspaceServerId
            ? {
                ...current,
                channels: reconcileChannels(current.channels, channel),
              }
            : current,
        );
      },
    );
    const unsubscribeCategories = subscribeToLiveChannelCategories(
      workspaceServerId,
      (category) => {
        setWorkspace((current) =>
          current && current.server.id === workspaceServerId
            ? {
                ...current,
                channelCategories: reconcileChannelCategories(
                  current.channelCategories,
                  category,
                ),
              }
            : current,
        );
      },
    );
    return () => {
      unsubscribeChannels();
      unsubscribeCategories();
    };
  }, [workspaceServerId]);

  const refreshStickers = useCallback(async () => {
    if (appConfig.dataMode !== "live" || !workspaceServerId) return;
    const catalog = await loadStickers(workspaceServerId);
    const hydrated = await Promise.all(
      catalog.map(async (sticker) => {
        try {
          const [poster, animation] = await Promise.all([
            downloadStickerMedia(sticker.posterPath, true),
            sticker.animationPath
              ? downloadStickerMedia(sticker.animationPath)
              : Promise.resolve(null),
          ]);
          const posterUrl = URL.createObjectURL(poster);
          const animationUrl = animation
            ? URL.createObjectURL(animation)
            : null;
          return {
            ...sticker,
            posterUrl,
            animationUrl,
            objectUrls: animationUrl ? [posterUrl, animationUrl] : [posterUrl],
          };
        } catch {
          return { ...sticker, objectUrls: [] as string[] };
        }
      }),
    );
    for (const urls of stickerObjectUrlsRef.current.values()) {
      urls.forEach((url) => URL.revokeObjectURL(url));
    }
    stickerObjectUrlsRef.current.clear();
    hydrated.forEach((sticker) => {
      stickerObjectUrlsRef.current.set(sticker.id, sticker.objectUrls);
    });
    setStickers(
      hydrated.map((sticker) => {
        const next = { ...sticker } as Sticker & { objectUrls?: string[] };
        delete next.objectUrls;
        return next;
      }),
    );
  }, [workspaceServerId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !workspaceServerId) {
      setStickers([]);
      return;
    }
    void refreshStickers().catch(() => undefined);
    const unsubscribeStickers = subscribeToStickers(
      workspaceServerId,
      () => void refreshStickers().catch(() => undefined),
    );
    const unsubscribeReactions = subscribeToStickerReactions((messageId) => {
      void loadLiveMessageById(messageId)
        .then((message) =>
          updateChannelThread(message.channelId, (current) =>
            mergeMessages(
              current.filter((item) => item.id !== message.id),
              [message],
            ),
          ),
        )
        .catch(() => undefined);
      void loadDirectMessageById(messageId)
        .then((message) =>
          updateDirectThread(message.conversationId, (current) =>
            mergeMessages(
              current.filter((item) => item.id !== message.id),
              [message],
            ),
          ),
        )
        .catch(() => undefined);
    });
    return () => {
      unsubscribeStickers();
      unsubscribeReactions();
    };
  }, [
    refreshStickers,
    updateChannelThread,
    updateDirectThread,
    workspaceServerId,
  ]);

  useEffect(() => {
    if (
      dataFreshness !== "offline" ||
      !stickers.some(
        (sticker) =>
          sticker.posterPath &&
          !sticker.posterUrl &&
          !offlineStickerHydrationAttemptsRef.current.has(sticker.id),
      )
    ) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      stickers.map(async (sticker) => {
        if (
          !sticker.posterPath ||
          sticker.posterUrl ||
          offlineStickerHydrationAttemptsRef.current.has(sticker.id)
        ) {
          return sticker;
        }
        offlineStickerHydrationAttemptsRef.current.add(sticker.id);
        try {
          const poster = await downloadStickerMedia(sticker.posterPath, true);
          if (cancelled) return sticker;
          const posterUrl = URL.createObjectURL(poster);
          const urls = stickerObjectUrlsRef.current.get(sticker.id) ?? [];
          stickerObjectUrlsRef.current.set(sticker.id, [...urls, posterUrl]);
          return { ...sticker, posterUrl, animationUrl: null };
        } catch {
          return sticker;
        }
      }),
    ).then((hydrated) => {
      if (!cancelled) setStickers(hydrated);
    });
    return () => {
      cancelled = true;
    };
  }, [dataFreshness, stickers]);

  useEffect(() => {
    offlineStickerHydrationAttemptsRef.current.clear();
    if (appConfig.dataMode !== "live" || !signedInUserId) return;
    void cleanupStaleMessageAttachments().catch(() => undefined);
  }, [signedInUserId]);

  const activeVoiceChannelId =
    voice.channel &&
    (voice.status === "connected" || voice.status === "reconnecting")
      ? voice.channel.id
      : null;

  useEffect(() => {
    void presenceSubscriptionRef.current?.setVoiceState(
      activeVoiceChannelId,
      voice.screenShareEnabled,
    );
  }, [activeVoiceChannelId, voice.screenShareEnabled]);

  useEffect(() => {
    if (voice.status === "disconnected") setSoundboardOpen(false);
  }, [voice.status]);

  useEffect(() => {
    if (!soundboardOpen) return;
    const closeFromEscape = (event: KeyboardEvent) => {
      if (
        !shouldDismissSoundboardForEscape(
          event.key,
          Boolean(
            document.querySelector(
              '[data-overlay-owner="soundboard"][role="dialog"]',
            ),
          ),
        )
      ) {
        return;
      }
      event.preventDefault();
      const opener = document.querySelector<HTMLElement>(
        '[aria-controls="soundboard-drawer"][aria-expanded="true"]',
      );
      setSoundboardOpen(false);
      window.setTimeout(() => opener?.focus(), 0);
    };
    const closeFromOutsidePointer = (event: PointerEvent) => {
      if (
        !shouldDismissSoundboardForPointer(
          event.target,
          soundboardDrawerRef.current,
        )
      ) {
        return;
      }
      setSoundboardOpen(false);
    };
    document.addEventListener("keydown", closeFromEscape);
    document.addEventListener("pointerdown", closeFromOutsidePointer, true);
    return () => {
      document.removeEventListener("keydown", closeFromEscape);
      document.removeEventListener(
        "pointerdown",
        closeFromOutsidePointer,
        true,
      );
    };
  }, [soundboardOpen]);

  useEffect(() => {
    if (
      activeView !== "channel" ||
      channelDialog ||
      screenShareDialogOpen ||
      openProfile
    ) {
      setSoundboardOpen(false);
    }
  }, [activeView, channelDialog, openProfile, screenShareDialogOpen]);

  const selectedChannel = useMemo(
    () =>
      workspace?.channels.find((channel) => channel.id === selectedChannelId) ??
      null,
    [selectedChannelId, workspace],
  );
  const selectedConversation = useMemo(
    () =>
      directConversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ) ?? null,
    [directConversations, selectedConversationId],
  );
  const inviteBlocksShell =
    appConfig.dataMode === "live" &&
    (inviteGateOpen ||
      (needsInvite &&
        !directHistoryLoading &&
        directConversations.length === 0));
  const shellReady = Boolean(
    user &&
    !inviteBlocksShell &&
    (activeSpace === "personal" || (workspace && selectedChannel)),
  );

  useEffect(() => {
    if (shellReady && startupAssembly === "pending") {
      setStartupAssembly("running");
    }
  }, [shellReady, startupAssembly]);

  useEffect(() => {
    if (startupAssembly !== "running") return;
    const timeout = window.setTimeout(
      () => setStartupAssembly("complete"),
      500,
    );
    return () => window.clearTimeout(timeout);
  }, [startupAssembly]);
  const openedProfileMember =
    workspace?.members.find((member) => member.id === openProfile?.memberId) ??
    directConversations.find(
      (conversation) => conversation.otherMember.id === openProfile?.memberId,
    )?.otherMember ??
    null;

  useEffect(() => {
    if (openProfile && !openedProfileMember) setOpenProfile(null);
  }, [openProfile, openedProfileMember]);

  const visibleVoice = useMemo(() => {
    if (!voice.channel || !workspace) return voice;
    const latestChannel = workspace.channels.find(
      (channel) => channel.id === voice.channel?.id,
    );
    return latestChannel ? { ...voice, channel: latestChannel } : voice;
  }, [voice, workspace]);
  const messageChannelIds = useMemo(
    () =>
      workspace?.channels
        .filter((channel) => channel.kind === "text")
        .map((channel) => channel.id) ?? [],
    [workspace?.channels],
  );
  const channelKey = messageChannelIds.join("|");
  const messageChannelIdSet = useMemo(
    () => new Set(messageChannelIds),
    [messageChannelIds],
  );

  const voiceOccupants = useMemo<VoiceRoomOccupant[]>(() => {
    if (!workspace) return [];
    const membersById = new Map(
      workspace.members.map((member) => [member.id, member]),
    );
    return voiceSessions.flatMap((session) => {
      const member = membersById.get(session.userId);
      return member
        ? [
            {
              userId: member.id,
              displayName: member.displayName,
              avatarUrl: member.avatarUrl,
              channelId: session.channelId,
              joinedAt: session.joinedAt,
              isStreaming: session.isStreaming,
            },
          ]
        : [];
    });
  }, [voiceSessions, workspace]);
  const memberVoiceActivities = useMemo<MemberVoiceActivity[]>(() => {
    if (!workspace) return [];
    const memberIds = new Set(workspace.members.map((member) => member.id));
    const channelNames = new Map(
      workspace.channels
        .filter((channel) => channel.kind === "voice")
        .map((channel) => [channel.id, channel.name]),
    );
    const activityByUserId = new Map<string, MemberVoiceActivity>();

    voiceSessions.forEach((session) => {
      const channelName = channelNames.get(session.channelId);
      if (!channelName || !memberIds.has(session.userId)) return;
      activityByUserId.set(session.userId, {
        userId: session.userId,
        channelId: session.channelId,
        channelName,
        isStreaming: session.isStreaming,
      });
    });

    const currentChannel = visibleVoice.channel;
    const currentCallActive =
      currentChannel &&
      (visibleVoice.status === "connected" ||
        visibleVoice.status === "reconnecting") &&
      channelNames.has(currentChannel.id);
    if (currentCallActive) {
      const streamingUserIds = new Set(
        visibleVoice.screenShares.map((share) => share.ownerId),
      );
      if (visibleVoice.screenShareEnabled && signedInUserId) {
        streamingUserIds.add(signedInUserId);
      }
      const currentUserIds = new Set([
        ...(signedInUserId ? [signedInUserId] : []),
        ...visibleVoice.participants.map((participant) => participant.id),
      ]);
      currentUserIds.forEach((userId) => {
        if (!memberIds.has(userId)) return;
        activityByUserId.set(userId, {
          userId,
          channelId: currentChannel.id,
          channelName: currentChannel.name,
          isStreaming: streamingUserIds.has(userId),
        });
      });
    }

    return [...activityByUserId.values()];
  }, [signedInUserId, visibleVoice, voiceSessions, workspace]);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    activeSpaceRef.current = activeSpace;
  }, [activeSpace]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    if (
      appConfig.dataMode !== "live" ||
      !signedInUserId ||
      cachedAccountReadyRef.current !== signedInUserId
    ) {
      return;
    }
    if (activeSpace === "personal" && selectedConversationId) {
      lastDestinationRef.current = {
        kind: "direct",
        id: selectedConversationId,
      };
    } else if (selectedChannel?.kind === "text") {
      lastDestinationRef.current = {
        kind: "channel",
        id: selectedChannel.id,
      };
    }
    const timeout = window.setTimeout(() => {
      void localCache
        .writeAccountState({
          userId: signedInUserId,
          workspace,
          directConversations,
          stickers,
          lastDestination: lastDestinationRef.current,
        })
        .then(() => localCache.stats(signedInUserId))
        .then(setCacheStats);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [
    activeSpace,
    directConversations,
    selectedChannel,
    selectedConversationId,
    signedInUserId,
    stickers,
    workspace,
  ]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || dataFreshness !== "offline") return;
    const retry = () => setWorkspaceRevision((current) => current + 1);
    const onFocus = () => {
      if (document.visibilityState === "visible") retry();
    };
    const timeout = window.setTimeout(retry, 10_000);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [dataFreshness]);

  const refreshChannelActivity = useCallback(async () => {
    if (
      appConfig.dataMode !== "live" ||
      !workspaceServerId ||
      !signedInUserId
    ) {
      return;
    }
    const activity = (await loadLiveChannelActivity(workspaceServerId)).filter(
      (item) => messageChannelIdSet.has(item.channelId),
    );
    setLatestMessageIds(
      Object.fromEntries(
        activity.map((item) => [item.channelId, item.latestMessageId]),
      ),
    );
    setUnreadChannelIds(
      new Set(
        activity.filter((item) => item.hasUnread).map((item) => item.channelId),
      ),
    );
  }, [messageChannelIdSet, signedInUserId, workspaceServerId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !workspaceServerId) return;
    void refreshChannelActivity().catch(() => undefined);
  }, [refreshChannelActivity, workspaceServerId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !signedInUserId) return;
    return subscribeToLiveReadStates(signedInUserId, () => {
      void refreshChannelActivity().catch(() => undefined);
    });
  }, [refreshChannelActivity, signedInUserId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !signedInUserId) return;
    const subscribedChannelIds = channelKey ? channelKey.split("|") : [];
    const unsubscribers = subscribedChannelIds.map((channelId) =>
      subscribeToLiveMessages(channelId, (message) => {
        const selected = message.channelId === selectedChannelIdRef.current;
        const visible = selected && activeViewRef.current === "channel";
        let isNewMessage = false;
        updateChannelThread(message.channelId, (current) => {
          isNewMessage = !current.some((item) => item.id === message.id);
          return mergeMessages(current, [message]);
        });
        if (!isNewMessage) return;
        setLatestMessageIds((current) => ({
          ...current,
          [message.channelId]: message.id,
        }));
        if (visible || message.authorId === signedInUserId) {
          setUnreadChannelIds((current) =>
            markChannelRead(current, message.channelId),
          );
          if (visible) {
            void markLiveChannelRead(message.channelId, message.id).catch(
              () => undefined,
            );
          }
        } else {
          setUnreadChannelIds((current) =>
            unreadChannelsAfterMessage(current, message, "", signedInUserId),
          );
        }
        if (shouldPlayIncomingMessageSound(message, signedInUserId)) {
          handleCommunicationEffect({ type: "message-received" });
        }
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [
    channelKey,
    handleCommunicationEffect,
    signedInUserId,
    updateChannelThread,
  ]);

  const selectedMessageChannelId =
    selectedChannel?.kind === "text" ? selectedChannel.id : null;
  useEffect(() => {
    if (!signedInUserId || !selectedMessageChannelId) return;
    let cancelled = false;
    setAppError(null);
    const load = async () => {
      try {
        let cached =
          channelThreadsRef.current.get(selectedMessageChannelId) ?? [];
        if (cached.length === 0 && appConfig.dataMode === "live") {
          cached = await localCache.readThread<ChatMessage>(
            signedInUserId,
            "channel",
            selectedMessageChannelId,
          );
        }
        if (!cancelled && cached.length > 0) {
          updateChannelThread(
            selectedMessageChannelId,
            (current) => mergeMessages(current, cached),
            false,
          );
        }
        const newestCached = cached.at(-1);
        const nextMessages =
          appConfig.dataMode === "mock"
            ? mockMessages.filter(
                (message) => message.channelId === selectedMessageChannelId,
              )
            : await loadLiveMessages(
                selectedMessageChannelId,
                newestCached
                  ? {
                      after: {
                        createdAt: newestCached.createdAt,
                        id: newestCached.id,
                      },
                      limit: MAX_CACHED_MESSAGES_PER_THREAD,
                    }
                  : { limit: 50 },
              );
        if (!cancelled) {
          updateChannelThread(selectedMessageChannelId, (current) =>
            mergeMessages(current, cached, nextMessages),
          );
        }
      } catch (caught) {
        if (!cancelled) {
          if (
            channelThreadsRef.current.get(selectedMessageChannelId)?.length &&
            isConnectivityError(caught)
          ) {
            setDataFreshness("offline");
          } else {
            setAppError(
              caught instanceof Error
                ? caught.message
                : "Messages could not be loaded.",
            );
          }
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    selectedMessageChannelId,
    signedInUserId,
    updateChannelThread,
    workspaceRevision,
  ]);

  useEffect(() => {
    if (
      !selectedChannel ||
      selectedChannel.kind !== "text" ||
      activeView !== "channel"
    )
      return;
    const latestMessageId = latestMessageIds[selectedChannel.id];
    setUnreadChannelIds((current) =>
      markChannelRead(current, selectedChannel.id),
    );
    if (appConfig.dataMode === "live" && latestMessageId) {
      void markLiveChannelRead(selectedChannel.id, latestMessageId).catch(
        () => undefined,
      );
    }
  }, [activeView, latestMessageIds, selectedChannel]);

  useEffect(() => {
    if (!signedInUserId || !selectedConversationId) return;
    let cancelled = false;
    const load = async () => {
      try {
        let cached = directThreadsRef.current.get(selectedConversationId) ?? [];
        if (cached.length === 0 && appConfig.dataMode === "live") {
          cached = await localCache.readThread<DirectMessage>(
            signedInUserId,
            "direct",
            selectedConversationId,
          );
        }
        if (!cancelled && cached.length > 0) {
          updateDirectThread(
            selectedConversationId,
            (current) => mergeMessages(current, cached),
            false,
          );
        }
        const newestCached = cached.at(-1);
        const nextMessages =
          appConfig.dataMode === "mock"
            ? cached
            : await loadDirectMessages(
                selectedConversationId,
                newestCached
                  ? {
                      after: {
                        createdAt: newestCached.createdAt,
                        id: newestCached.id,
                      },
                      limit: MAX_CACHED_MESSAGES_PER_THREAD,
                    }
                  : { limit: 50 },
              );
        if (!cancelled) {
          updateDirectThread(selectedConversationId, (current) =>
            mergeMessages(current, cached, nextMessages),
          );
        }
      } catch (caught) {
        if (!cancelled) {
          if (
            directThreadsRef.current.get(selectedConversationId)?.length &&
            isConnectivityError(caught)
          ) {
            setDataFreshness("offline");
          } else {
            setAppError(
              caught instanceof Error
                ? caught.message
                : "Direct messages could not be loaded.",
            );
          }
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    selectedConversationId,
    signedInUserId,
    updateDirectThread,
    workspaceRevision,
  ]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !signedInUserId) return;
    messages
      .filter((message) =>
        shouldRequestLinkPreview(message, linkPreviewAttemptsRef.current),
      )
      .forEach((message) => {
        linkPreviewAttemptsRef.current.add(message.id);
        void requestLinkPreview("channel", message.id)
          .then((preview) => {
            if (!preview) return;
            updateChannelThread(message.channelId, (current) =>
              current.map((item) =>
                item.id === message.id
                  ? { ...item, linkPreview: preview }
                  : item,
              ),
            );
          })
          .catch(() => undefined);
      });
    directMessages
      .filter((message) =>
        shouldRequestLinkPreview(message, linkPreviewAttemptsRef.current),
      )
      .forEach((message) => {
        linkPreviewAttemptsRef.current.add(message.id);
        void requestLinkPreview("direct", message.id)
          .then((preview) => {
            if (!preview) return;
            updateDirectThread(message.conversationId, (current) =>
              current.map((item) =>
                item.id === message.id
                  ? { ...item, linkPreview: preview }
                  : item,
              ),
            );
          })
          .catch(() => undefined);
      });
  }, [
    directMessages,
    messages,
    signedInUserId,
    updateChannelThread,
    updateDirectThread,
  ]);

  useEffect(() => {
    if (
      activeSpace !== "personal" ||
      activeView !== "channel" ||
      !selectedConversation?.latestMessageId
    ) {
      return;
    }
    setDirectConversations((current) => {
      const target = current.find(
        (conversation) => conversation.id === selectedConversation.id,
      );
      if (!target?.hasUnread) return current;
      return current.map((conversation) =>
        conversation.id === selectedConversation.id
          ? { ...conversation, hasUnread: false }
          : conversation,
      );
    });
    if (appConfig.dataMode === "live") {
      void markDirectConversationRead(
        selectedConversation.id,
        selectedConversation.latestMessageId,
      ).catch(() => undefined);
    }
  }, [activeSpace, activeView, selectedConversation]);

  const handleDirectSend = useCallback(
    async (draft: MessageDraft) => {
      if (!user || !selectedConversation) return;
      if (dataFreshness === "offline") {
        throw new Error("Reconnect before sending a direct message.");
      }
      const conversationId = selectedConversation.id;
      const content = draftToSegments(draft);
      const body = draftFallbackBody(draft);
      if (!body) return;
      setDirectSending(true);
      setAppError(null);
      const optimisticId = `pending-${crypto.randomUUID()}`;
      const optimistic: DirectMessage = {
        id: optimisticId,
        conversationId,
        authorId: user.id,
        body,
        content,
        createdAt: new Date().toISOString(),
        presentation: draft.presentation ?? null,
        attachments: optimisticAttachments(draft),
        reply: draft.replyTo ?? null,
        replyNotifiesAuthor:
          Boolean(draft.replyTo) &&
          draft.replyTo?.authorId !== user.id &&
          (draft.notifyReplyAuthor ?? true),
        reactions: [],
        pending: true,
      };
      updateDirectThread(
        conversationId,
        (current) => mergeMessages(current, [optimistic]),
        false,
      );
      const uploadController =
        appConfig.dataMode === "live" && draft.attachments?.length
          ? new AbortController()
          : null;
      if (uploadController) {
        uploadAbortControllersRef.current.set(optimisticId, uploadController);
      }
      try {
        const attachmentIds =
          appConfig.dataMode === "live" && draft.attachments?.length
            ? await uploadMessageAttachments(
                "direct",
                conversationId,
                draft.attachments,
                (attachmentId, progress) => {
                  setDirectDrafts((current) => ({
                    ...current,
                    [conversationId]: {
                      ...(current[conversationId] ?? draft),
                      attachments: (
                        current[conversationId]?.attachments ??
                        draft.attachments ??
                        []
                      ).map((attachment) =>
                        attachment.id === attachmentId
                          ? {
                              ...attachment,
                              progress,
                              status: "uploading",
                            }
                          : attachment,
                      ),
                    },
                  }));
                  updateDirectThread(
                    conversationId,
                    (current) =>
                      current.map((message) =>
                        message.id === optimisticId
                          ? {
                              ...message,
                              attachments: (message.attachments ?? []).map(
                                (attachment) =>
                                  attachment.id === attachmentId
                                    ? {
                                        ...attachment,
                                        uploadProgress: progress,
                                      }
                                    : attachment,
                              ),
                            }
                          : message,
                      ),
                    false,
                  );
                },
                uploadController?.signal,
              )
            : [];
        const saved =
          appConfig.dataMode === "mock"
            ? {
                ...optimistic,
                id: `direct-${crypto.randomUUID()}`,
                pending: false,
              }
            : await sendDirectMessage(conversationId, content, {
                replyToId: draft.replyTo?.id ?? null,
                notifyReplyAuthor: draft.notifyReplyAuthor ?? true,
                attachmentIds,
                presentation: draft.presentation ?? null,
              });
        updateDirectThread(conversationId, (current) =>
          mergeMessages(
            current.filter(
              (message) =>
                message.id !== optimisticId && message.id !== saved.id,
            ),
            [saved],
          ),
        );
        setDirectConversations((current) =>
          current
            .map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    latestMessageId: saved.id,
                    latestMessageAuthorId: saved.authorId,
                    latestMessageBody: saved.body,
                    latestMessageCreatedAt: saved.createdAt,
                    updatedAt: saved.createdAt,
                    hasUnread: false,
                  }
                : conversation,
            )
            .sort(
              (left, right) =>
                Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
            ),
        );
        handleCommunicationEffect({ type: "message-sent" });
      } catch (caught) {
        updateDirectThread(
          conversationId,
          (current) => current.filter((message) => message.id !== optimisticId),
          false,
        );
        setAppError(
          caught instanceof Error
            ? caught.message
            : "The direct message did not send.",
        );
        throw caught;
      } finally {
        uploadAbortControllersRef.current.delete(optimisticId);
        setDirectSending(false);
      }
    },
    [
      dataFreshness,
      handleCommunicationEffect,
      selectedConversation,
      updateDirectThread,
      user,
    ],
  );

  const handleSend = useCallback(
    async (draft: MessageDraft) => {
      if (!user || !selectedChannel || selectedChannel.kind !== "text") return;
      if ((selectedChannel.purpose ?? "chat") !== "chat") {
        throw new Error("This channel is managed by Bakbak automation.");
      }
      if (dataFreshness === "offline") {
        throw new Error("Reconnect before sending a message.");
      }
      const channelId = selectedChannel.id;
      const content = draftToSegments(draft);
      const body = draftFallbackBody(draft);
      if (!body) return;
      setSending(true);
      setAppError(null);
      const optimisticId = `pending-${crypto.randomUUID()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        channelId,
        authorId: user.id,
        body,
        content,
        createdAt: new Date().toISOString(),
        presentation: draft.presentation ?? null,
        attachments: optimisticAttachments(draft),
        reply: draft.replyTo ?? null,
        replyNotifiesAuthor:
          Boolean(draft.replyTo) &&
          draft.replyTo?.authorId !== user.id &&
          (draft.notifyReplyAuthor ?? true),
        reactions: [],
        pending: true,
      };
      updateChannelThread(
        channelId,
        (current) => mergeMessages(current, [optimistic]),
        false,
      );
      const uploadController =
        appConfig.dataMode === "live" && draft.attachments?.length
          ? new AbortController()
          : null;
      if (uploadController) {
        uploadAbortControllersRef.current.set(optimisticId, uploadController);
      }
      try {
        const attachmentIds =
          appConfig.dataMode === "live" && draft.attachments?.length
            ? await uploadMessageAttachments(
                "channel",
                channelId,
                draft.attachments,
                (attachmentId, progress) => {
                  setDrafts((current) => ({
                    ...current,
                    [channelId]: {
                      ...(current[channelId] ?? draft),
                      attachments: (
                        current[channelId]?.attachments ??
                        draft.attachments ??
                        []
                      ).map((attachment) =>
                        attachment.id === attachmentId
                          ? {
                              ...attachment,
                              progress,
                              status: "uploading",
                            }
                          : attachment,
                      ),
                    },
                  }));
                  updateChannelThread(
                    channelId,
                    (current) =>
                      current.map((message) =>
                        message.id === optimisticId
                          ? {
                              ...message,
                              attachments: (message.attachments ?? []).map(
                                (attachment) =>
                                  attachment.id === attachmentId
                                    ? {
                                        ...attachment,
                                        uploadProgress: progress,
                                      }
                                    : attachment,
                              ),
                            }
                          : message,
                      ),
                    false,
                  );
                },
                uploadController?.signal,
              )
            : [];
        if (appConfig.dataMode === "mock") {
          await new Promise((resolve) => window.setTimeout(resolve, 240));
          updateChannelThread(channelId, (current) =>
            current.map((message) =>
              message.id === optimisticId
                ? {
                    ...message,
                    id: `message-${crypto.randomUUID()}`,
                    pending: false,
                  }
                : message,
            ),
          );
        } else {
          const saved = await sendLiveMessage(channelId, content, {
            replyToId: draft.replyTo?.id ?? null,
            notifyReplyAuthor: draft.notifyReplyAuthor ?? true,
            attachmentIds,
            presentation: draft.presentation ?? null,
          });
          updateChannelThread(channelId, (current) =>
            mergeMessages(
              current.filter(
                (message) =>
                  message.id !== optimisticId && message.id !== saved.id,
              ),
              [saved],
            ),
          );
          setLatestMessageIds((current) => ({
            ...current,
            [channelId]: saved.id,
          }));
          void markLiveChannelRead(channelId, saved.id).catch(() => undefined);
        }
        handleCommunicationEffect({ type: "message-sent" });
      } catch (caught) {
        updateChannelThread(
          channelId,
          (current) => current.filter((message) => message.id !== optimisticId),
          false,
        );
        const message =
          caught instanceof Error
            ? caught.message
            : "The message did not send.";
        setAppError(message);
        throw caught;
      } finally {
        uploadAbortControllersRef.current.delete(optimisticId);
        setSending(false);
      }
    },
    [
      dataFreshness,
      handleCommunicationEffect,
      selectedChannel,
      updateChannelThread,
      user,
    ],
  );

  const handleChannelDelete = useCallback(
    async (messageId: string) => {
      if (!selectedMessageChannelId) return;
      if (messageId.startsWith("pending-")) {
        uploadAbortControllersRef.current.get(messageId)?.abort();
        updateChannelThread(
          selectedMessageChannelId,
          (current) => current.filter((message) => message.id !== messageId),
          false,
        );
        return;
      }
      if (appConfig.dataMode === "live") {
        await deleteRichMessage("channel", messageId);
      }
      updateChannelThread(selectedMessageChannelId, (current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                body: "",
                content: [],
                presentation: null,
                attachments: [],
                reactions: [],
                deletedAt: new Date().toISOString(),
              }
            : message,
        ),
      );
    },
    [selectedMessageChannelId, updateChannelThread],
  );

  const handleDirectDelete = useCallback(
    async (messageId: string) => {
      if (!selectedConversationId) return;
      if (messageId.startsWith("pending-")) {
        uploadAbortControllersRef.current.get(messageId)?.abort();
        updateDirectThread(
          selectedConversationId,
          (current) => current.filter((message) => message.id !== messageId),
          false,
        );
        return;
      }
      if (appConfig.dataMode === "live") {
        await deleteRichMessage("direct", messageId);
      }
      updateDirectThread(selectedConversationId, (current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                body: "",
                content: [],
                presentation: null,
                attachments: [],
                reactions: [],
                deletedAt: new Date().toISOString(),
              }
            : message,
        ),
      );
    },
    [selectedConversationId, updateDirectThread],
  );

  const handleChannelReaction = useCallback(
    async (messageId: string, stickerId: string) => {
      if (!selectedMessageChannelId || !user) return;
      if (appConfig.dataMode === "live") {
        await toggleStickerReaction("channel", messageId, stickerId);
        const hydrated = await loadLiveMessageById(messageId);
        updateChannelThread(hydrated.channelId, (current) =>
          mergeMessages(
            current.filter((message) => message.id !== hydrated.id),
            [hydrated],
          ),
        );
        return;
      }
      updateChannelThread(selectedMessageChannelId, (current) =>
        toggleMockReaction(current, messageId, stickerId, user.id),
      );
    },
    [selectedMessageChannelId, updateChannelThread, user],
  );

  const handleDirectReaction = useCallback(
    async (messageId: string, stickerId: string) => {
      if (!selectedConversationId || !user) return;
      if (appConfig.dataMode === "live") {
        await toggleStickerReaction("direct", messageId, stickerId);
        const hydrated = await loadDirectMessageById(messageId);
        updateDirectThread(hydrated.conversationId, (current) =>
          mergeMessages(
            current.filter((message) => message.id !== hydrated.id),
            [hydrated],
          ),
        );
        return;
      }
      updateDirectThread(selectedConversationId, (current) =>
        toggleMockReaction(current, messageId, stickerId, user.id),
      );
    },
    [selectedConversationId, updateDirectThread, user],
  );

  const handleStickerUpload = useCallback(
    async (file: File, label: string) => {
      if (!workspaceServerId || !user) return;
      const prepared = await prepareStickerUpload(file);
      if (appConfig.dataMode === "live") {
        await uploadSticker(
          workspaceServerId,
          label,
          prepared.poster,
          prepared.animation,
        );
        await refreshStickers();
        return;
      }
      const posterUrl = URL.createObjectURL(prepared.poster);
      const animationUrl = prepared.animation
        ? URL.createObjectURL(prepared.animation)
        : null;
      setStickers((current) => [
        ...current,
        {
          id: `sticker-${crypto.randomUUID()}`,
          serverId: workspaceServerId,
          label,
          posterPath: "",
          animationPath: animationUrl ? "" : null,
          width: prepared.width,
          height: prepared.height,
          createdBy: user.id,
          enabled: true,
          createdAt: new Date().toISOString(),
          posterUrl,
          animationUrl,
        },
      ]);
    },
    [refreshStickers, user, workspaceServerId],
  );

  const handleStickerArchive = useCallback(
    async (stickerId: string) => {
      if (appConfig.dataMode === "live") {
        await archiveSticker(stickerId);
        await refreshStickers();
        return;
      }
      setStickers((current) =>
        current.map((sticker) =>
          sticker.id === stickerId ? { ...sticker, enabled: false } : sticker,
        ),
      );
    },
    [refreshStickers],
  );

  const handleLoadOlderChannelMessages = useCallback(async () => {
    if (
      appConfig.dataMode !== "live" ||
      dataFreshness === "offline" ||
      !selectedMessageChannelId
    ) {
      return 0;
    }
    const current =
      channelThreadsRef.current.get(selectedMessageChannelId) ?? [];
    const earliest = current[0];
    if (!earliest) return 0;
    const older = await loadLiveMessages(selectedMessageChannelId, {
      before: { createdAt: earliest.createdAt, id: earliest.id },
      limit: 50,
    });
    updateChannelThread(selectedMessageChannelId, (messages) =>
      mergeMessages(messages, older),
    );
    return older.length;
  }, [dataFreshness, selectedMessageChannelId, updateChannelThread]);

  const handleLoadOlderDirectMessages = useCallback(async () => {
    if (
      appConfig.dataMode !== "live" ||
      dataFreshness === "offline" ||
      !selectedConversationId
    ) {
      return 0;
    }
    const current = directThreadsRef.current.get(selectedConversationId) ?? [];
    const earliest = current[0];
    if (!earliest) return 0;
    const older = await loadDirectMessages(selectedConversationId, {
      before: { createdAt: earliest.createdAt, id: earliest.id },
      limit: 50,
    });
    updateDirectThread(selectedConversationId, (messages) =>
      mergeMessages(messages, older),
    );
    return older.length;
  }, [dataFreshness, selectedConversationId, updateDirectThread]);

  const handleClearCachedData = useCallback(async () => {
    if (!signedInUserId) return;
    cachedAccountReadyRef.current = null;
    await localCache.clearAccount(signedInUserId);
    profileMediaCacheRef.current.clear();
    channelThreadsRef.current.clear();
    directThreadsRef.current.clear();
    setMessages([]);
    setDirectMessages([]);
    setWorkspace(null);
    setDirectConversations([]);
    setSelectedChannelId("");
    setSelectedConversationId(null);
    setCacheStats({
      messageBytes: 0,
      messageCount: 0,
      profileMediaBytes: 0,
      profileMediaCount: 0,
      messageMediaBytes: 0,
      messageMediaCount: 0,
      totalBytes: 0,
    });
    if (dataFreshness === "offline") {
      setAppError("No saved data is available while Bakbak is offline.");
      return;
    }
    setDataFreshness("loading");
    setWorkspaceRevision((current) => current + 1);
  }, [dataFreshness, signedInUserId]);

  function openSettings(section: SettingsSection = "profile") {
    setOpenProfile(null);
    setSettingsSection(section);
    setActiveView("settings");
  }
  const toggleSoundboard = useCallback(
    () => setSoundboardOpen((open) => !open),
    [],
  );

  async function handleSaveProfile(input: ProfileSaveInput) {
    if (!user) throw new Error("Sign in before editing your profile.");
    if (dataFreshness === "offline") {
      throw new Error("Reconnect before changing your profile.");
    }
    let displayName = input.displayName.trim();
    let description = input.description.trim();
    let avatarPath = user.avatarPath;
    let avatarAnimationPath = user.avatarAnimationPath;
    let avatarUrl = user.avatarUrl;
    let avatarAnimationUrl = user.avatarAnimationUrl;
    let coverPath = user.coverPath;
    let coverAnimationPath = user.coverAnimationPath;
    let coverUrl = user.coverUrl;
    let coverAnimationUrl = user.coverAnimationUrl;
    let coverPositionX = input.coverPositionX;
    let coverPositionY = input.coverPositionY;
    let warning: string | undefined;

    if (appConfig.dataMode === "live") {
      const saved = await saveLiveProfile({
        userId: user.id,
        displayName,
        description,
        currentAvatarPath: avatarPath,
        currentAvatarAnimationPath: avatarAnimationPath,
        currentAvatarUrl: avatarUrl,
        currentCoverPath: coverPath,
        currentCoverAnimationPath: coverAnimationPath,
        avatarFile: input.avatarFile,
        coverFile: input.coverFile,
        removeAvatar: input.removeAvatar,
        removeCover: input.removeCover,
        coverPositionX,
        coverPositionY,
      });
      if (avatarAnimationPath !== saved.avatarAnimationPath) {
        profileMediaCacheRef.current.evict(AVATAR_BUCKET, avatarAnimationPath);
      }
      if (coverPath !== saved.coverPath) {
        profileMediaCacheRef.current.evict(COVER_BUCKET, coverPath);
      }
      if (coverAnimationPath !== saved.coverAnimationPath) {
        profileMediaCacheRef.current.evict(COVER_BUCKET, coverAnimationPath);
      }
      displayName = saved.displayName;
      description = saved.description;
      avatarPath = saved.avatarPath;
      avatarAnimationPath = saved.avatarAnimationPath;
      avatarUrl = saved.avatarUrl;
      avatarAnimationUrl = null;
      coverPath = saved.coverPath;
      coverAnimationPath = saved.coverAnimationPath;
      coverUrl = null;
      coverAnimationUrl = null;
      coverPositionX = saved.coverPositionX;
      coverPositionY = saved.coverPositionY;
      warning = saved.metadataWarning ?? undefined;
    } else {
      if (input.removeAvatar) {
        avatarPath = null;
        avatarAnimationPath = null;
        avatarUrl = null;
        avatarAnimationUrl = null;
      } else if (input.avatarFile) {
        const prepared = await prepareProfileImage(input.avatarFile, "avatar");
        avatarPath = `mock/${crypto.randomUUID()}`;
        avatarAnimationPath = prepared.animation
          ? `mock/${crypto.randomUUID()}`
          : null;
        avatarUrl = await fileToDataUrl(prepared.poster);
        avatarAnimationUrl = prepared.animation
          ? await fileToDataUrl(prepared.animation)
          : null;
      }
      if (input.removeCover) {
        coverPath = null;
        coverAnimationPath = null;
        coverUrl = null;
        coverAnimationUrl = null;
        coverPositionX = 50;
        coverPositionY = 50;
      } else if (input.coverFile) {
        const prepared = await prepareProfileImage(input.coverFile, "cover");
        coverPath = `mock/${crypto.randomUUID()}`;
        coverAnimationPath = prepared.animation
          ? `mock/${crypto.randomUUID()}`
          : null;
        coverUrl = await fileToDataUrl(prepared.poster);
        coverAnimationUrl = prepared.animation
          ? await fileToDataUrl(prepared.animation)
          : null;
      }
    }

    rememberAvatarUrl(user.id, avatarUrl);
    const nextProfile = {
      displayName,
      description,
      avatarPath,
      avatarAnimationPath,
      avatarUrl,
      avatarAnimationUrl,
      coverPath,
      coverAnimationPath,
      coverUrl,
      coverAnimationUrl,
      coverPositionX,
      coverPositionY,
    };
    setUser((current) => (current ? { ...current, ...nextProfile } : current));
    setWorkspace((current) =>
      current
        ? {
            ...current,
            members: current.members.map((member) =>
              member.id === user.id ? { ...member, ...nextProfile } : member,
            ),
          }
        : current,
    );
    return warning ? { warning } : {};
  }

  function handleInterfaceSoundPreferencesChange(
    preferences: InterfaceSoundPreferences,
  ) {
    setInterfaceSoundPreferences(preferences);
    interfaceSoundController.setPreferences(preferences);
    saveInterfaceSoundPreferences(preferences);
  }

  function handleAppearancePreferenceChange(preference: AppearancePreference) {
    setAppearancePreference(preference);
    applyAppearancePreference(preference);
    saveAppearancePreference(preference);
  }

  function updateLayoutPreferences(
    updater: (current: LayoutPreferences) => LayoutPreferences,
  ) {
    setLayoutPreferences((current) => {
      const next = updater(current);
      saveLayoutPreferences(next);
      return next;
    });
  }

  async function handleCreateChannel(kind: ChannelKind, name: string) {
    if (dataFreshness === "offline") {
      throw new Error("Reconnect before creating a channel.");
    }
    if (!workspace || workspace.currentUserRole !== "admin") {
      throw new Error("Only a server admin can create channels.");
    }
    const channel =
      appConfig.dataMode === "live"
        ? await createLiveChannel({ serverId: workspace.server.id, kind, name })
        : {
            id: `channel-${crypto.randomUUID()}`,
            serverId: workspace.server.id,
            categoryId: null,
            name: name.trim(),
            kind,
            purpose: "chat" as const,
            position:
              Math.max(
                -10,
                ...workspace.channels
                  .filter(
                    (candidate) =>
                      candidate.kind === kind && candidate.categoryId === null,
                  )
                  .map((candidate) => candidate.position),
              ) + 10,
            topic:
              kind === "voice"
                ? "Drop in when you feel like talking."
                : "A private conversation for server members.",
          };
    setWorkspace((current) =>
      current
        ? { ...current, channels: reconcileChannels(current.channels, channel) }
        : current,
    );
    handleSelectChannel(channel);
  }

  async function handleRenameChannel(channel: Channel, name: string) {
    if (dataFreshness === "offline") {
      throw new Error("Reconnect before renaming a channel.");
    }
    if (!workspace || workspace.currentUserRole !== "admin") {
      throw new Error("Only a server admin can rename channels.");
    }
    if ((channel.purpose ?? "chat") !== "chat") {
      throw new Error("System channels are managed by Bakbak automation.");
    }
    const renamed =
      appConfig.dataMode === "live"
        ? await renameLiveChannel({ channelId: channel.id, name })
        : { ...channel, name: name.trim() };
    setWorkspace((current) =>
      current
        ? { ...current, channels: reconcileChannels(current.channels, renamed) }
        : current,
    );
  }

  async function handleSignOut() {
    setSoundboardOpen(false);
    await voice.leave("sign-out");
    await releaseMicrophoneProcessing();
    await presenceSubscriptionRef.current?.setVoiceState(null);
    if (appConfig.dataMode === "live") {
      try {
        await signOut();
      } catch (caught) {
        const error =
          caught instanceof Error ? caught : new Error("Sign out failed.");
        setAppError(error.message);
        throw error;
      }
    }
    setUser(null);
  }

  function transitionToSpace(space: AppSpace) {
    if (space !== activeSpace) {
      setSpaceTransitionRevision((current) => current + 1);
    }
    setActiveSpace(space);
  }

  function handleSelectChannel(channel: Channel) {
    setOpenProfile(null);
    setUserContextMenu(null);
    setStreamWatchRequest((current) =>
      current?.channelId === channel.id ? current : null,
    );
    setSoundboardOpen(false);
    transitionToSpace("server");
    selectedChannelIdRef.current = channel.id;
    if (channel.kind === "text") {
      setMessages(channelThreadsRef.current.get(channel.id) ?? []);
    }
    setSelectedChannelId(channel.id);
    setActiveView("channel");
    if (
      channel.kind === "voice" &&
      dataFreshness !== "offline" &&
      (voice.channel?.id !== channel.id ||
        voice.status === "disconnected" ||
        voice.status === "error")
    ) {
      setSoundboardOpen(false);
      void voice.join(channel);
    }
  }

  function handleSelectConversation(conversation: DirectConversation) {
    setOpenProfile(null);
    setUserContextMenu(null);
    setStreamWatchRequest(null);
    setSoundboardOpen(false);
    selectedConversationIdRef.current = conversation.id;
    setDirectMessages(directThreadsRef.current.get(conversation.id) ?? []);
    setSelectedConversationId(conversation.id);
    transitionToSpace("personal");
    setActiveView("channel");
  }

  async function handleStartConversation(member: ServerMember) {
    setAppError(null);
    if (dataFreshness === "offline") {
      throw new Error("Reconnect before starting a conversation.");
    }
    if (appConfig.dataMode === "mock") {
      const existing = directConversations.find(
        (conversation) => conversation.otherMember.id === member.id,
      );
      const conversation =
        existing ??
        ({
          id: `direct-${member.id}`,
          otherMember: member,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          latestMessageId: null,
          latestMessageAuthorId: null,
          latestMessageBody: null,
          latestMessageCreatedAt: null,
          hasUnread: false,
        } satisfies DirectConversation);
      if (!existing) {
        setDirectConversations((current) => [conversation, ...current]);
      }
      handleSelectConversation(conversation);
      return;
    }
    try {
      const conversationId = await getOrCreateDirectConversation(member.id);
      await refreshDirectConversations();
      selectedConversationIdRef.current = conversationId;
      setSelectedConversationId(conversationId);
      transitionToSpace("personal");
      setActiveView("channel");
    } catch (caught) {
      setAppError(
        caught instanceof Error
          ? caught.message
          : "The direct conversation could not be opened.",
      );
      throw caught;
    }
  }

  async function handleMessageUser(member: ServerMember) {
    const existing = directConversations.find(
      (conversation) => conversation.otherMember.id === member.id,
    );
    if (existing) {
      handleSelectConversation(existing);
      return;
    }
    await handleStartConversation(member);
  }

  function handleWatchStream(member: ServerMember, channelId: string) {
    const channel = workspace?.channels.find(
      (candidate) => candidate.id === channelId && candidate.kind === "voice",
    );
    if (!channel || member.id === user?.id) return;
    streamWatchSequenceRef.current += 1;
    setAppError(null);
    setOpenProfile(null);
    setUserContextMenu(null);
    setStreamWatchRequest({
      requestId: streamWatchSequenceRef.current,
      ownerId: member.id,
      channelId,
    });
    handleSelectChannel(channel);
  }

  function handleSelectSpace(space: AppSpace) {
    if (space === "server" && !workspace) return;
    setOpenProfile(null);
    if (space !== "server") setStreamWatchRequest(null);
    setSoundboardOpen(false);
    transitionToSpace(space);
    setActiveView("channel");
  }

  const personalUnread = directConversations.some(
    (conversation) => conversation.hasUnread,
  );
  const blockingDialogOpen =
    activeView === "settings" ||
    channelDialog !== null ||
    screenShareDialogOpen;

  function renderAppFrame(content: ReactNode, showSpaceSwitcher = false) {
    return (
      <div
        className="app-frame"
        data-startup-assembly={showSpaceSwitcher ? startupAssembly : undefined}
      >
        <WindowTitlebar
          showSpaceSwitcher={showSpaceSwitcher}
          activeSpace={activeSpace}
          personalUnread={personalUnread}
          serverUnread={unreadChannelIds.size > 0}
          callActive={voice.status !== "disconnected"}
          callStatus={voice.status}
          callChannelName={voice.channel?.name ?? null}
          serverAvailable={Boolean(workspace)}
          switchDisabled={blockingDialogOpen}
          onSelectSpace={handleSelectSpace}
          {...(showSpaceSwitcher
            ? {
                panelControls: {
                  leftPanelVisible: layoutPreferences.leftPanelVisible,
                  rightPanelVisible: layoutPreferences.rightPanelVisible,
                  disabled: blockingDialogOpen,
                  onToggleLeftPanel: () =>
                    updateLayoutPreferences((current) => ({
                      ...current,
                      leftPanelVisible: !current.leftPanelVisible,
                    })),
                  onToggleRightPanel: () =>
                    updateLayoutPreferences((current) => ({
                      ...current,
                      rightPanelVisible: !current.rightPanelVisible,
                    })),
                },
              }
            : {})}
        />
        <div className="app-frame__content">{content}</div>
      </div>
    );
  }

  if (authLoading) {
    return renderAppFrame(<LoadingScreen />);
  }

  if (!user) {
    return renderAppFrame(
      <AuthScreen
        mode={appConfig.dataMode}
        configurationWarning={appConfig.configurationWarning}
        onAuthenticated={setUser}
        onEnterMock={() => setUser(mockCurrentUser)}
      />,
    );
  }

  if (
    (inviteGateOpen ||
      (needsInvite &&
        !directHistoryLoading &&
        directConversations.length === 0)) &&
    appConfig.dataMode === "live"
  ) {
    return renderAppFrame(
      <InviteGate
        user={user}
        onRedeemed={() => {
          setNeedsInvite(false);
          setInviteGateOpen(false);
          setWorkspaceRevision((current) => current + 1);
        }}
        onSignOut={() => void handleSignOut().catch(() => undefined)}
        onBack={
          directConversations.length > 0
            ? () => setInviteGateOpen(false)
            : undefined
        }
      />,
    );
  }

  if (activeSpace === "server" && (!workspace || !selectedChannel)) {
    if (!appError) {
      return renderAppFrame(<LoadingScreen />);
    }
    return renderAppFrame(
      <main className="app-loading app-loading--error">
        <BakbakMark className="brand-mark" />
        <h1>The door is stuck</h1>
        <p>{appError}</p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void handleSignOut().catch(() => undefined)}
        >
          Back to sign in
        </button>
      </main>,
    );
  }

  const personalMembers = Array.from(
    new Map(
      [
        ...(workspace?.members ?? [{ ...user, role: "member" as const }]),
        ...directConversations.map((conversation) => conversation.otherMember),
      ].map((member) => [member.id, member]),
    ).values(),
  );
  const reservedShellWidth = MIN_CONTENT_WIDTH + 30;
  const contextMaximum = Math.max(
    MIN_SIDE_PANEL_WIDTH,
    Math.min(
      MAX_SIDE_PANEL_WIDTH,
      viewportWidth -
        reservedShellWidth -
        (layoutPreferences.rightPanelVisible
          ? layoutPreferences.rightPanelWidth
          : 0),
    ),
  );
  const rightMaximum = Math.max(
    MIN_SIDE_PANEL_WIDTH,
    Math.min(
      MAX_SIDE_PANEL_WIDTH,
      viewportWidth -
        reservedShellWidth -
        (layoutPreferences.leftPanelVisible
          ? layoutPreferences.contextPanelWidth
          : 0),
    ),
  );
  const contextPanelWidth = Math.min(
    layoutPreferences.contextPanelWidth,
    contextMaximum,
  );
  const rightPanelWidth = Math.min(
    layoutPreferences.rightPanelWidth,
    rightMaximum,
  );
  const shellStyle = {
    "--context-panel-width": `${contextPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`,
  } as CSSProperties;

  return renderAppFrame(
    <div
      className="desktop-shell"
      style={shellStyle}
      data-left-panel={
        layoutPreferences.leftPanelVisible ? "visible" : "hidden"
      }
      data-right-panel={
        layoutPreferences.rightPanelVisible ? "visible" : "hidden"
      }
      data-space-transition={spaceTransitionRevision > 0 ? "true" : "false"}
    >
      <div
        className="panel-slot panel-slot--left"
        data-visible={layoutPreferences.leftPanelVisible ? "true" : "false"}
        aria-hidden={layoutPreferences.leftPanelVisible ? undefined : true}
        inert={layoutPreferences.leftPanelVisible ? undefined : true}
      >
        <div
          className="panel-slot__motion panel-slot__motion--left"
          key={`left-${activeSpace}-${spaceTransitionRevision}`}
        >
          {activeSpace === "server" && workspace && selectedChannel ? (
            <ChannelSidebar
              server={workspace.server}
              categories={workspace.channelCategories}
              channels={workspace.channels}
              selectedChannelId={selectedChannel.id}
              user={user}
              members={workspace.members}
              voiceOccupants={voiceOccupants}
              unreadChannelIds={unreadChannelIds}
              voice={visibleVoice}
              mode={appConfig.dataMode}
              soundboardOpen={soundboardOpen}
              canManageChannels={
                workspace.currentUserRole === "admin" &&
                dataFreshness !== "offline"
              }
              onSelect={handleSelectChannel}
              onPrepareVoiceChannel={voice.prepareVoiceChannel}
              onCreateChannel={(kind) => {
                setOpenProfile(null);
                setChannelDialog({ mode: "create", kind });
              }}
              onRenameChannel={(channel) => {
                setOpenProfile(null);
                setChannelDialog({ mode: "rename", channel });
              }}
              onOpenSettings={() => openSettings("profile")}
              loadProfileMedia={loadProfileMedia}
              onOpenProfile={handleOpenProfile}
              onOpenUserContextMenu={handleOpenUserContextMenu}
              openProfileId={openProfile?.memberId ?? null}
              onWatchStream={(member, channel) =>
                handleWatchStream(member, channel.id)
              }
              onToggleSoundboard={toggleSoundboard}
              onOpenScreenShare={() => {
                setOpenProfile(null);
                setScreenShareDialogOpen(true);
              }}
            />
          ) : (
            <PersonalSidebar
              user={user}
              members={personalMembers}
              conversations={directConversations}
              selectedConversationId={selectedConversationId}
              voice={visibleVoice}
              mode={appConfig.dataMode}
              soundboardOpen={soundboardOpen}
              onSelect={handleSelectConversation}
              onStartConversation={handleStartConversation}
              onOpenSettings={() => openSettings("profile")}
              onToggleSoundboard={toggleSoundboard}
              onOpenScreenShare={() => {
                setOpenProfile(null);
                setScreenShareDialogOpen(true);
              }}
              loadProfileMedia={loadProfileMedia}
              onOpenProfile={handleOpenProfile}
              onOpenUserContextMenu={handleOpenUserContextMenu}
              openProfileId={openProfile?.memberId ?? null}
              inviteAvailable={!workspace}
              onOpenInvite={() => setInviteGateOpen(true)}
              readOnly={dataFreshness === "offline"}
            />
          )}
        </div>
      </div>
      <PanelResizer
        label="Resize navigation panel"
        side="left"
        enabled={layoutPreferences.leftPanelVisible}
        value={contextPanelWidth}
        minimum={MIN_SIDE_PANEL_WIDTH}
        maximum={contextMaximum}
        defaultValue={DEFAULT_CONTEXT_PANEL_WIDTH}
        onChange={(contextPanelWidth) =>
          updateLayoutPreferences((current) => ({
            ...current,
            contextPanelWidth,
          }))
        }
      />
      <main className="content-shell">
        <TopBar
          channel={activeSpace === "server" ? selectedChannel : null}
          directMember={
            activeSpace === "personal"
              ? (selectedConversation?.otherMember ?? null)
              : null
          }
        />
        <div
          className="content-stage content-stage--space-motion"
          key={`content-${activeSpace}-${spaceTransitionRevision}`}
        >
          {appError ? (
            <div className="app-alert" role="alert">
              <CircleAlert size={16} />
              <span>{appError}</span>
              <button type="button" onClick={() => setAppError(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
          {dataFreshness === "offline" ? (
            <div className="offline-banner" role="status">
              Offline — showing saved data. Reconnecting automatically…
            </div>
          ) : dataFreshness === "cached" ? (
            <div className="offline-banner is-syncing" role="status">
              Showing saved data while Bakbak catches up…
            </div>
          ) : null}
          <div className="content-grid">
            {activeSpace === "personal" && selectedConversation ? (
              <ConversationView
                target={{
                  kind: "direct",
                  id: selectedConversation.id,
                  member: selectedConversation.otherMember,
                }}
                messages={directMessages.filter(
                  (message) =>
                    message.conversationId === selectedConversation.id,
                )}
                members={personalMembers}
                currentUser={user}
                sending={directSending}
                draft={
                  directDrafts[selectedConversation.id] ?? EMPTY_MESSAGE_DRAFT
                }
                onDraftChange={(draft) =>
                  setDirectDrafts((current) => ({
                    ...current,
                    [selectedConversation.id]: draft,
                  }))
                }
                onSend={handleDirectSend}
                readOnlyReason={
                  dataFreshness === "offline"
                    ? "Reconnect to send messages"
                    : null
                }
                onLoadOlder={handleLoadOlderDirectMessages}
                loadProfileMedia={loadProfileMedia}
                onOpenProfile={handleOpenProfile}
                onOpenUserContextMenu={handleOpenUserContextMenu}
                openProfileId={openProfile?.memberId ?? null}
                stickers={stickers}
                currentUserIsAdmin={workspace?.currentUserRole === "admin"}
                onDeleteMessage={handleDirectDelete}
                onReact={handleDirectReaction}
                onUploadSticker={handleStickerUpload}
                onArchiveSticker={handleStickerArchive}
              />
            ) : activeSpace === "personal" ? (
              <section className="personal-home">
                <BakbakMark className="personal-home__mark" />
                <span className="eyebrow">Personal lounge</span>
                <h2>Your conversations live here</h2>
                <p>
                  Start a private message from the left panel. No meeting agenda
                  is required, thankfully.
                </p>
              </section>
            ) : selectedChannel?.kind === "text" && workspace ? (
              <ChatView
                channel={selectedChannel}
                messages={messages.filter(
                  (message) => message.channelId === selectedChannel.id,
                )}
                members={workspace.members}
                currentUser={user}
                sending={sending}
                draft={drafts[selectedChannel.id] ?? EMPTY_MESSAGE_DRAFT}
                onDraftChange={(draft) =>
                  setDrafts((current) => ({
                    ...current,
                    [selectedChannel.id]: draft,
                  }))
                }
                onSend={handleSend}
                readOnlyReason={
                  dataFreshness === "offline"
                    ? "Reconnect to send messages"
                    : null
                }
                onLoadOlder={handleLoadOlderChannelMessages}
                loadProfileMedia={loadProfileMedia}
                onOpenProfile={handleOpenProfile}
                onOpenUserContextMenu={handleOpenUserContextMenu}
                openProfileId={openProfile?.memberId ?? null}
                stickers={stickers}
                currentUserIsAdmin={workspace.currentUserRole === "admin"}
                {...((selectedChannel.purpose ?? "chat") === "chat"
                  ? {
                      onDeleteMessage: handleChannelDelete,
                      onReact: handleChannelReaction,
                      onUploadSticker: handleStickerUpload,
                      onArchiveSticker: handleStickerArchive,
                    }
                  : {})}
              />
            ) : selectedChannel && workspace ? (
              <VoiceRoom
                channel={selectedChannel}
                user={user}
                members={workspace.members}
                voice={voice}
                onOpenSettings={() => openSettings("audio")}
                loadProfileMedia={loadProfileMedia}
                onOpenProfile={handleOpenProfile}
                onOpenUserContextMenu={handleOpenUserContextMenu}
                openProfileId={openProfile?.memberId ?? null}
                streamWatchRequest={streamWatchRequest}
                onStreamWatchHandled={(requestId, outcome) => {
                  setStreamWatchRequest((current) =>
                    current?.requestId === requestId ? null : current,
                  );
                  if (outcome === "missing") {
                    setAppError(
                      "That stream ended before Bakbak could open it.",
                    );
                  }
                }}
              />
            ) : null}
          </div>
        </div>
        {workspace && soundboardOpen && visibleVoice.status === "connected" ? (
          <aside
            ref={soundboardDrawerRef}
            className={`soundboard-drawer ${activeSpace === "personal" || selectedChannel?.kind === "text" ? "is-over-text" : ""}`}
            id="soundboard-drawer"
            aria-label="Soundboard"
          >
            <Soundboard
              serverId={workspace.server.id}
              currentUserId={user.id}
              currentUserRole={workspace.currentUserRole}
              connected
              deafened={voice.deafened}
              categories={voice.soundboard.categories}
              sounds={voice.soundboard.sounds}
              favoriteSoundIds={voice.soundboard.favoriteSoundIds}
              loading={voice.soundboard.loading}
              error={voice.soundboard.error}
              volume={voice.soundboardVolume}
              activeLocalSoundCount={voice.activeLocalSoundCount}
              maxConcurrentSounds={voice.maxConcurrentSounds}
              readOnly={dataFreshness === "offline"}
              onPlay={voice.dispatchSound}
              onStopAll={voice.stopLocalSounds}
              onVolumeChange={voice.setSoundboardVolume}
              onRetry={voice.soundboard.retrySound}
              onToggleFavorite={voice.soundboard.toggleFavorite}
              onUpload={voice.soundboard.uploadSound}
              onDelete={voice.soundboard.deleteSound}
              onUpdate={voice.updateSoundMetadata}
            />
          </aside>
        ) : null}
        {activeView === "channel" ? (
          <VoiceControlDock
            voice={visibleVoice}
            soundboardOpen={soundboardOpen}
            overTextChannel={
              activeSpace === "personal" || selectedChannel?.kind === "text"
            }
            onToggleSoundboard={toggleSoundboard}
            onOpenDevices={() => openSettings("audio")}
            onOpenScreenShare={() => {
              setOpenProfile(null);
              setScreenShareDialogOpen(true);
            }}
          />
        ) : null}
      </main>
      <PanelResizer
        label="Resize details panel"
        side="right"
        enabled={layoutPreferences.rightPanelVisible}
        value={rightPanelWidth}
        minimum={MIN_SIDE_PANEL_WIDTH}
        maximum={rightMaximum}
        defaultValue={DEFAULT_RIGHT_PANEL_WIDTH}
        onChange={(rightPanelWidth) =>
          updateLayoutPreferences((current) => ({
            ...current,
            rightPanelWidth,
          }))
        }
      />
      <div
        className="panel-slot panel-slot--right"
        data-visible={layoutPreferences.rightPanelVisible ? "true" : "false"}
        aria-hidden={layoutPreferences.rightPanelVisible ? undefined : true}
        inert={layoutPreferences.rightPanelVisible ? undefined : true}
      >
        <div
          className="panel-slot__motion panel-slot__motion--right"
          key={`right-${activeSpace}-${spaceTransitionRevision}`}
        >
          {activeSpace === "personal" ? (
            <DirectPersonPanel
              member={selectedConversation?.otherMember ?? null}
              loadProfileMedia={loadProfileMedia}
              onOpenUserContextMenu={handleOpenUserContextMenu}
              sharesServer={Boolean(
                workspace?.members.some(
                  (member) =>
                    member.id === selectedConversation?.otherMember.id,
                ),
              )}
            />
          ) : workspace ? (
            <MemberPanel
              members={workspace.members}
              voiceActivities={memberVoiceActivities}
              loadProfileMedia={loadProfileMedia}
              onOpenProfile={handleOpenProfile}
              onOpenUserContextMenu={handleOpenUserContextMenu}
              openProfileId={openProfile?.memberId ?? null}
              currentUserId={user.id}
              onWatchStream={(member, channelId) =>
                handleWatchStream(member, channelId)
              }
            />
          ) : null}
        </div>
      </div>
      {openProfile && openedProfileMember ? (
        <ProfilePopover
          member={openedProfileMember}
          anchor={openProfile.anchor}
          loadMedia={loadProfileMedia}
          onClose={() => setOpenProfile(null)}
        />
      ) : null}
      {userContextMenu ? (
        <UserContextMenu
          request={userContextMenu}
          currentUserId={user.id}
          canMessage={Boolean(
            userContextMenu.member.id !== user.id &&
            (directConversations.some(
              (conversation) =>
                conversation.otherMember.id === userContextMenu.member.id,
            ) ||
              (dataFreshness !== "offline" &&
                workspace?.members.some(
                  (member) => member.id === userContextMenu.member.id,
                ))),
          )}
          canToggleMute={voice.participants.some(
            (participant) =>
              !participant.isLocal &&
              participant.id === userContextMenu.member.id,
          )}
          mutedForMe={Boolean(
            voice.participants.find(
              (participant) =>
                !participant.isLocal &&
                participant.id === userContextMenu.member.id,
            )?.volume === 0,
          )}
          onViewProfile={handleOpenProfile}
          onMessage={handleMessageUser}
          onCopyUserId={async (member) => {
            try {
              if (!navigator.clipboard?.writeText) {
                throw new Error("Clipboard access is unavailable.");
              }
              await navigator.clipboard.writeText(member.id);
            } catch (caught) {
              setAppError(
                caught instanceof Error
                  ? caught.message
                  : "Bakbak could not copy that user ID.",
              );
            }
          }}
          onToggleMute={(member) => voice.toggleParticipantMute(member.id)}
          onClose={() => setUserContextMenu(null)}
        />
      ) : null}
      {screenShareDialogOpen ? (
        <ScreenShareDialog
          audioAvailable={voice.screenShareAudioAvailable}
          audioUnavailableReason={voice.screenShareUnavailableReason}
          customPicker={voice.screenShareCustomPicker}
          initialSettings={voice.screenShareSettings}
          onStart={(includeAudio, settings, sourceId) =>
            void voice.startScreenShare(includeAudio, settings, sourceId)
          }
          onClose={() => setScreenShareDialogOpen(false)}
        />
      ) : null}
      {channelDialog ? (
        <ChannelDialog
          kind={
            channelDialog.mode === "create"
              ? channelDialog.kind
              : channelDialog.channel.kind
          }
          channel={
            channelDialog.mode === "rename" ? channelDialog.channel : null
          }
          onSave={(name) =>
            channelDialog.mode === "create"
              ? handleCreateChannel(channelDialog.kind, name)
              : handleRenameChannel(channelDialog.channel, name)
          }
          onClose={() => setChannelDialog(null)}
        />
      ) : null}
      {activeView === "settings" ? (
        <SettingsPage
          user={user}
          section={settingsSection}
          inputDevices={voice.inputDevices}
          outputDevices={voice.outputDevices}
          cameraDevices={voice.cameraDevices}
          selectedInputId={voice.selectedInputId}
          selectedOutputId={voice.selectedOutputId}
          selectedCameraId={voice.selectedCameraId}
          soundboardVolume={voice.soundboardVolume}
          enhancedNoiseSuppression={voice.enhancedNoiseSuppression}
          voiceEffect={voice.voiceEffect}
          microphoneProcessingSupported={voice.microphoneProcessingSupported}
          microphoneProcessingError={voice.microphoneProcessingError}
          interfaceSoundPreferences={interfaceSoundPreferences}
          appearancePreference={appearancePreference}
          systemAccent={systemAccent}
          cacheStats={cacheStats}
          dataFreshness={dataFreshness}
          readOnly={dataFreshness === "offline"}
          inputError={voice.inputDeviceError}
          outputError={voice.outputDeviceError}
          cameraError={voice.cameraDeviceError}
          outputSelectionSupported={voice.outputSelectionSupported}
          inputDisabled={
            voice.status === "connecting" || voice.status === "reconnecting"
          }
          voiceStatus={voice.status}
          voiceChannelName={voice.channel?.name ?? null}
          voiceMuted={voice.muted}
          voiceDeafened={voice.deafened}
          onToggleMute={voice.toggleMute}
          onToggleDeafen={voice.toggleDeafen}
          onLeaveVoice={() => void voice.leave()}
          onSectionChange={setSettingsSection}
          onSaveProfile={handleSaveProfile}
          loadProfileMedia={loadProfileMedia}
          onInputChange={(deviceId) => void voice.setInputDevice(deviceId)}
          onOutputChange={(deviceId) => void voice.setOutputDevice(deviceId)}
          onCameraChange={(deviceId) => void voice.setCameraDevice(deviceId)}
          onRefreshDevices={voice.refreshDevices}
          onSoundboardVolumeChange={voice.setSoundboardVolume}
          onEnhancedNoiseSuppressionChange={(enabled) =>
            void voice.setEnhancedNoiseSuppression(enabled)
          }
          onVoiceEffectChange={(effect) => void voice.setVoiceEffect(effect)}
          onInterfaceSoundPreferencesChange={
            handleInterfaceSoundPreferencesChange
          }
          onAppearancePreferenceChange={handleAppearancePreferenceChange}
          onClearCachedData={handleClearCachedData}
          onPreviewInterfaceSound={(category) =>
            void interfaceSoundController.preview(category)
          }
          onSignOut={handleSignOut}
          onClose={() => setActiveView("channel")}
        />
      ) : null}
    </div>,
    true,
  );
}

function TopBar({
  channel,
  directMember,
}: {
  channel: Channel | null;
  directMember: ServerMember | null;
}) {
  return (
    <header className="top-bar">
      <div className="top-bar__leading">
        <div className="top-bar__channel">
          {directMember ? (
            <Avatar user={directMember} size="small" showStatus />
          ) : channel?.kind === "voice" ? (
            <Volume2 size={20} />
          ) : (
            <Hash size={20} />
          )}
          <div>
            <strong>
              {directMember?.displayName ?? channel?.name ?? "Personal"}
            </strong>
            <span>
              {directMember
                ? `Private conversation · ${directMember.status}`
                : (channel?.topic ??
                  "Private conversations, minus the ceremonial paperwork")}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function richMemberFromProfile(
  member: ServerMember,
  profile: ProfileRow,
  options: {
    avatarUrl: string | null;
    avatarResolved: boolean;
    mediaCache: ProfileMediaCache;
  },
): ServerMember {
  if (member.avatarAnimationPath !== profile.avatar_animation_path) {
    options.mediaCache.evict(AVATAR_BUCKET, member.avatarAnimationPath);
  }
  if (member.coverPath !== profile.cover_path) {
    options.mediaCache.evict(COVER_BUCKET, member.coverPath);
  }
  if (member.coverAnimationPath !== profile.cover_animation_path) {
    options.mediaCache.evict(COVER_BUCKET, member.coverAnimationPath);
  }
  return {
    ...member,
    displayName: profile.display_name,
    description: profile.description,
    avatarPath: profile.avatar_path,
    avatarAnimationPath: profile.avatar_animation_path,
    avatarAnimationUrl:
      member.avatarAnimationPath === profile.avatar_animation_path
        ? member.avatarAnimationUrl
        : null,
    avatarUrl: options.avatarResolved ? options.avatarUrl : member.avatarUrl,
    coverPath: profile.cover_path,
    coverUrl: member.coverPath === profile.cover_path ? member.coverUrl : null,
    coverAnimationPath: profile.cover_animation_path,
    coverAnimationUrl:
      member.coverAnimationPath === profile.cover_animation_path
        ? member.coverAnimationUrl
        : null,
    coverPositionX: profile.cover_position_x,
    coverPositionY: profile.cover_position_y,
  };
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected image could not be read."));
    });
    reader.addEventListener("error", () =>
      reject(
        reader.error ?? new Error("The selected image could not be read."),
      ),
    );
    reader.readAsDataURL(file);
  });
}
