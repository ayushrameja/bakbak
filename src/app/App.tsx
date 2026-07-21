import { CircleAlert, Hash, MessageCircle, Volume2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ProfilePopover } from "../components/ProfilePopover";
import { PanelResizer } from "../components/PanelResizer";
import type {
  LoadProfileMedia,
  OpenProfile,
} from "../components/ProfileTrigger";
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
import {
  draftToSegments,
  EMPTY_MESSAGE_DRAFT,
  segmentsToFallback,
} from "../features/chat/message-content";
import { MemberPanel } from "../features/server/MemberPanel";
import type { AppSpace } from "../features/server/app-space";
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
import { Soundboard } from "../features/soundboard/Soundboard";
import {
  shouldDismissSoundboardForEscape,
  shouldDismissSoundboardForPointer,
} from "../features/soundboard/soundboard-dismissal";
import { useSoundboardCatalog } from "../features/soundboard/useSoundboardCatalog";
import { ScreenShareDialog } from "../features/voice/ScreenShareDialog";
import { VoiceControlDock } from "../features/voice/VoiceControlDock";
import { VoiceRoom } from "../features/voice/VoiceRoom";
import { useVoiceRoom } from "../features/voice/useVoiceRoom";
import { sessionToAppUser, signOut } from "../lib/auth-service";
import { useAutoHideScrollbars } from "../lib/use-auto-hide-scrollbars";
import type { CommunicationEffectEvent } from "../lib/communication-effects";
import {
  createLiveChannel,
  reconcileChannels,
  renameLiveChannel,
  subscribeToLiveChannels,
} from "../lib/channel-service";
import { appConfig } from "../lib/env";
import {
  getOrCreateDirectConversation,
  loadDirectConversations,
  loadDirectMessages,
  markDirectConversationRead,
  sendDirectMessage,
  subscribeToDirectMessages,
  subscribeToDirectReadStates,
} from "../lib/direct-message-service";
import { mockCurrentUser, mockMessages, mockWorkspace } from "../lib/mock-data";
import { getSupabaseClient } from "../lib/supabase";
import {
  AVATAR_BUCKET,
  COVER_BUCKET,
  downloadAvatarObjectUrl,
  prepareProfileImage,
  saveLiveProfile,
  subscribeToProfileChanges,
  type ProfileRow,
} from "../lib/profile-service";
import { ProfileMediaCache } from "../lib/profile-media-cache";
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
  DirectConversation,
  DirectMessage,
  MessageDraft,
  ServerMember,
  WorkspaceSnapshot,
  VoiceRoomOccupant,
} from "../lib/types";
import {
  loadLiveChannelActivity,
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
  const [sending, setSending] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("channel");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("profile");
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
  const selectedChannelIdRef = useRef(selectedChannelId);
  const selectedConversationIdRef = useRef(selectedConversationId);
  const activeViewRef = useRef(activeView);
  const activeSpaceRef = useRef(activeSpace);
  const presenceSubscriptionRef = useRef<ServerPresenceSubscription | null>(
    null,
  );
  const avatarObjectUrlsRef = useRef(new Map<string, string>());
  const profileMediaCacheRef = useRef(new ProfileMediaCache());
  const profileUpdateSequenceRef = useRef(new Map<string, number>());
  const voiceDeafenedRef = useRef(false);
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
    interfaceSoundController.setPreferences(interfaceSoundPreferences);
  }, [interfaceSoundPreferences]);

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
    (bucket, path) => profileMediaCacheRef.current.load(bucket, path),
    [],
  );
  const handleOpenProfile = useCallback<OpenProfile>((member, anchor) => {
    setOpenProfile({ memberId: member.id, anchor });
  }, []);

  useEffect(
    () => () => {
      avatarObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      avatarObjectUrlsRef.current.clear();
      profileMediaCacheRef.current.clear();
      profileUpdateSequenceRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const enable = () => void interfaceSoundController.activate();
    window.addEventListener("pointerdown", enable, { once: true });
    window.addEventListener("keydown", enable, { once: true });
    return () => {
      window.removeEventListener("pointerdown", enable);
      window.removeEventListener("keydown", enable);
    };
  }, []);

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
      profileMediaCacheRef.current.clear();
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
      return;
    }
    let cancelled = false;
    setAppError(null);
    const load = async () => {
      try {
        let snapshot =
          appConfig.dataMode === "mock"
            ? mockWorkspace
            : await loadLiveWorkspace({
                id: signedInUserId,
                email: signedInUserEmail,
              });
        if (appConfig.dataMode === "live") {
          const members = await Promise.all(
            snapshot.members.map(async (member) => {
              if (!member.avatarPath) return member;
              try {
                const avatarUrl = await downloadAvatarObjectUrl(
                  member.avatarPath,
                  member.avatarUrl,
                );
                if (cancelled) {
                  if (avatarUrl?.startsWith("blob:")) {
                    URL.revokeObjectURL(avatarUrl);
                  }
                  return member;
                }
                if (avatarUrl) rememberAvatarUrl(member.id, avatarUrl);
                return { ...member, avatarUrl };
              } catch {
                return member;
              }
            }),
          );
          snapshot = { ...snapshot, members };
        }
        if (cancelled) return;
        setWorkspace(snapshot);
        const currentMember = snapshot.members.find(
          (member) => member.id === signedInUserId,
        );
        if (currentMember) {
          setUser((current) => {
            if (!current || current.id !== currentMember.id) return current;
            if (
              current.displayName === currentMember.displayName &&
              current.avatarUrl === currentMember.avatarUrl &&
              current.avatarPath === currentMember.avatarPath &&
              current.avatarAnimationPath ===
                currentMember.avatarAnimationPath &&
              current.coverPath === currentMember.coverPath &&
              current.coverAnimationPath === currentMember.coverAnimationPath &&
              current.coverPositionX === currentMember.coverPositionX &&
              current.coverPositionY === currentMember.coverPositionY &&
              current.description === currentMember.description
            ) {
              return current;
            }
            return {
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
            };
          });
        }
        setNeedsInvite(false);
        setSelectedChannelId(
          (current) =>
            snapshot.channels.find((channel) => channel.id === current)?.id ??
            snapshot.channels.find((channel) => channel.kind === "text")?.id ??
            snapshot.channels[0]?.id ??
            "",
        );
      } catch (caught) {
        if (!cancelled) {
          const missingMembership = caught instanceof MissingMembershipError;
          setNeedsInvite(missingMembership);
          if (missingMembership) {
            setWorkspace(null);
            setSelectedChannelId("");
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
  }, [rememberAvatarUrl, signedInUserEmail, signedInUserId, workspaceRevision]);

  const refreshDirectConversations = useCallback(async () => {
    if (!signedInUserId) return;
    try {
      const conversations =
        appConfig.dataMode === "mock" ? [] : await loadDirectConversations();
      setDirectConversations((current) => {
        const statuses = new Map(
          current.map((conversation) => [
            conversation.otherMember.id,
            conversation.otherMember.status,
          ]),
        );
        return conversations.map((conversation) => ({
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
      });
      setSelectedConversationId((current) =>
        conversations.some((conversation) => conversation.id === current)
          ? current
          : (conversations[0]?.id ?? null),
      );
    } finally {
      setDirectHistoryLoading(false);
    }
  }, [signedInUserId, workspace]);

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
      if (selected) {
        setDirectMessages((current) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
        );
      }
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
  }, [handleCommunicationEffect, refreshDirectConversations, signedInUserId]);

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
          avatarUrl = await downloadAvatarObjectUrl(
            profile.avatar_path,
            profile.avatar_url,
          );
        } catch {
          // Keep the last usable avatar if a transient Storage read fails.
          avatarResolved = false;
        }
        if (
          cancelled ||
          profileUpdateSequenceRef.current.get(profile.id) !== sequence
        ) {
          if (avatarResolved && avatarUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(avatarUrl);
          }
          return;
        }
        if (avatarResolved) rememberAvatarUrl(profile.id, avatarUrl);
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
  }, [rememberAvatarUrl, workspaceServerId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !workspaceServerId) return;
    return subscribeToLiveChannels(workspaceServerId, (channel) => {
      setWorkspace((current) =>
        current && current.server.id === workspaceServerId
          ? {
              ...current,
              channels: reconcileChannels(current.channels, channel),
            }
          : current,
      );
    });
  }, [workspaceServerId]);

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
        if (selected) {
          setMessages((current) =>
            current.some((item) => item.id === message.id)
              ? current
              : [...current, message],
          );
        }
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
  }, [channelKey, handleCommunicationEffect, signedInUserId]);

  const selectedMessageChannelId =
    selectedChannel?.kind === "text" ? selectedChannel.id : null;
  useEffect(() => {
    if (!signedInUserId || !selectedMessageChannelId) return;
    let cancelled = false;
    setAppError(null);
    const load = async () => {
      try {
        const nextMessages =
          appConfig.dataMode === "mock"
            ? mockMessages.filter(
                (message) => message.channelId === selectedMessageChannelId,
              )
            : await loadLiveMessages(selectedMessageChannelId);
        if (!cancelled) {
          setMessages((current) => {
            const byId = new Map(
              nextMessages.map((message) => [message.id, message]),
            );
            current
              .filter(
                (message) => message.channelId === selectedMessageChannelId,
              )
              .forEach((message) => byId.set(message.id, message));
            return [...byId.values()].sort(
              (left, right) =>
                Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
                left.id.localeCompare(right.id),
            );
          });
        }
      } catch (caught) {
        if (!cancelled) {
          setAppError(
            caught instanceof Error
              ? caught.message
              : "Messages could not be loaded.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedMessageChannelId, signedInUserId]);

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
        const nextMessages =
          appConfig.dataMode === "mock"
            ? directMessages.filter(
                (message) => message.conversationId === selectedConversationId,
              )
            : await loadDirectMessages(selectedConversationId);
        if (!cancelled) setDirectMessages(nextMessages);
      } catch (caught) {
        if (!cancelled) {
          setAppError(
            caught instanceof Error
              ? caught.message
              : "Direct messages could not be loaded.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // Mock messages already live in local state and must not retrigger the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, signedInUserId]);

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
      const content = draftToSegments(draft);
      const body = segmentsToFallback(content);
      if (!body) return;
      setDirectSending(true);
      setAppError(null);
      const optimisticId = `pending-${crypto.randomUUID()}`;
      const optimistic: DirectMessage = {
        id: optimisticId,
        conversationId: selectedConversation.id,
        authorId: user.id,
        body,
        content,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setDirectMessages((current) => [...current, optimistic]);
      try {
        const saved =
          appConfig.dataMode === "mock"
            ? {
                ...optimistic,
                id: `direct-${crypto.randomUUID()}`,
                pending: false,
              }
            : await sendDirectMessage(selectedConversation.id, content);
        setDirectMessages((current) => [
          ...current.filter(
            (message) => message.id !== optimisticId && message.id !== saved.id,
          ),
          saved,
        ]);
        setDirectConversations((current) =>
          current
            .map((conversation) =>
              conversation.id === selectedConversation.id
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
      } catch (caught) {
        setDirectMessages((current) =>
          current.filter((message) => message.id !== optimisticId),
        );
        setAppError(
          caught instanceof Error
            ? caught.message
            : "The direct message did not send.",
        );
        throw caught;
      } finally {
        setDirectSending(false);
      }
    },
    [selectedConversation, user],
  );

  const handleSend = useCallback(
    async (draft: MessageDraft) => {
      if (!user || !selectedChannel || selectedChannel.kind !== "text") return;
      const content = draftToSegments(draft);
      const body = segmentsToFallback(content);
      if (!body) return;
      setSending(true);
      setAppError(null);
      const optimisticId = `pending-${crypto.randomUUID()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        channelId: selectedChannel.id,
        authorId: user.id,
        body,
        content,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((current) => [...current, optimistic]);
      try {
        if (appConfig.dataMode === "mock") {
          await new Promise((resolve) => window.setTimeout(resolve, 240));
          setMessages((current) =>
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
          const saved = await sendLiveMessage(selectedChannel.id, content);
          setMessages((current) => [
            ...current.filter(
              (message) =>
                message.id !== optimisticId && message.id !== saved.id,
            ),
            saved,
          ]);
          setLatestMessageIds((current) => ({
            ...current,
            [selectedChannel.id]: saved.id,
          }));
          void markLiveChannelRead(selectedChannel.id, saved.id).catch(
            () => undefined,
          );
        }
      } catch (caught) {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticId),
        );
        const message =
          caught instanceof Error
            ? caught.message
            : "The message did not send.";
        setAppError(message);
        throw caught;
      } finally {
        setSending(false);
      }
    },
    [selectedChannel, user],
  );

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
    if (!workspace || workspace.currentUserRole !== "admin") {
      throw new Error("Only a server admin can rename channels.");
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
    setSoundboardOpen(false);
    transitionToSpace("server");
    selectedChannelIdRef.current = channel.id;
    setSelectedChannelId(channel.id);
    setActiveView("channel");
    if (
      channel.kind === "voice" &&
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
    setSoundboardOpen(false);
    selectedConversationIdRef.current = conversation.id;
    setSelectedConversationId(conversation.id);
    transitionToSpace("personal");
    setActiveView("channel");
  }

  async function handleStartConversation(member: ServerMember) {
    setAppError(null);
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

  function handleSelectSpace(space: AppSpace) {
    if (space === "server" && !workspace) return;
    setOpenProfile(null);
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
    return renderAppFrame(
      <main className="app-loading">
        <span className="brand-mark">
          <MessageCircle size={24} />
        </span>
        <h1>Opening Bakbak</h1>
        <p>Checking whether you already have a seat…</p>
      </main>,
    );
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
    return renderAppFrame(
      <main className="app-loading">
        <span className="brand-mark">
          <MessageCircle size={24} />
        </span>
        <h1>{appError ? "The door is stuck" : "Setting the room up"}</h1>
        <p>
          {appError ??
            "Moving the chairs into a suspiciously thoughtful circle…"}
        </p>
        {appError ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => void handleSignOut().catch(() => undefined)}
          >
            Back to sign in
          </button>
        ) : null}
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
              canManageChannels={workspace.currentUserRole === "admin"}
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
              openProfileId={openProfile?.memberId ?? null}
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
              openProfileId={openProfile?.memberId ?? null}
              inviteAvailable={!workspace}
              onOpenInvite={() => setInviteGateOpen(true)}
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
                loadProfileMedia={loadProfileMedia}
                onOpenProfile={handleOpenProfile}
                openProfileId={openProfile?.memberId ?? null}
              />
            ) : activeSpace === "personal" ? (
              <section className="personal-home">
                <img src="/bakbak.svg" alt="" />
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
                loadProfileMedia={loadProfileMedia}
                onOpenProfile={handleOpenProfile}
                openProfileId={openProfile?.memberId ?? null}
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
                openProfileId={openProfile?.memberId ?? null}
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
              loadProfileMedia={loadProfileMedia}
              onOpenProfile={handleOpenProfile}
              openProfileId={openProfile?.memberId ?? null}
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
            <MessageCircle size={20} />
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
