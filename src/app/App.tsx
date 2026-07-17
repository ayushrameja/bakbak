import {
  CircleAlert,
  Hash,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProfilePopover } from "../components/ProfilePopover";
import type {
  LoadProfileMedia,
  OpenProfile,
} from "../components/ProfileTrigger";
import { AuthScreen } from "../features/auth/AuthScreen";
import { InviteGate } from "../features/auth/InviteGate";
import { ChannelDialog } from "../features/channels/ChannelDialog";
import { ChannelSidebar } from "../features/channels/ChannelSidebar";
import {
  markChannelRead,
  shouldPlayIncomingMessageSound,
  unreadChannelsAfterMessage,
} from "../features/chat/channel-activity";
import { ChatView } from "../features/chat/ChatView";
import {
  draftToSegments,
  EMPTY_MESSAGE_DRAFT,
  segmentsToFallback,
} from "../features/chat/message-content";
import {
  enableIncomingMessageSound,
  playIncomingMessageSound,
} from "../features/chat/message-sound";
import { MemberPanel } from "../features/server/MemberPanel";
import {
  loadAppearancePreferences,
  setAppearancePreferences as persistAppearancePreferences,
  type AccentColor,
  type AppearancePreferences,
  type SurfaceStyle,
  type ThemePreference,
} from "../features/settings/appearance-preferences";
import {
  loadLayoutPreferences,
  saveLayoutPreferences,
  type LayoutPreferences,
} from "../features/settings/layout-preferences";
import {
  SettingsPage,
  type ProfileSaveInput,
  type SettingsSection,
} from "../features/settings/SettingsPage";
import { Soundboard } from "../features/soundboard/Soundboard";
import { useSoundboardCatalog } from "../features/soundboard/useSoundboardCatalog";
import { ScreenShareDialog } from "../features/voice/ScreenShareDialog";
import { VoiceControlDock } from "../features/voice/VoiceControlDock";
import { VoiceRoom } from "../features/voice/VoiceRoom";
import { useVoiceRoom } from "../features/voice/useVoiceRoom";
import { sessionToAppUser, signOut } from "../lib/auth-service";
import {
  createLiveChannel,
  reconcileChannels,
  renameLiveChannel,
  subscribeToLiveChannels,
} from "../lib/channel-service";
import { appConfig } from "../lib/env";
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("channel");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("profile");
  const [appearancePreferences, setAppearancePreferences] =
    useState<AppearancePreferences>(() => loadAppearancePreferences());
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(
    () => loadLayoutPreferences(),
  );
  const [soundboardOpen, setSoundboardOpen] = useState(false);
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
  const activeViewRef = useRef(activeView);
  const presenceSubscriptionRef = useRef<ServerPresenceSubscription | null>(
    null,
  );
  const avatarObjectUrlsRef = useRef(new Map<string, string>());
  const profileMediaCacheRef = useRef(new ProfileMediaCache());
  const profileUpdateSequenceRef = useRef(new Map<string, number>());
  const signedInUserId = user?.id;
  const signedInUserEmail = user?.email ?? "";
  const workspaceServerId = workspace?.server.id;
  const soundboard = useSoundboardCatalog(
    workspaceServerId,
    appConfig.dataMode,
  );
  const voice = useVoiceRoom(
    user ?? mockCurrentUser,
    appConfig.dataMode,
    soundboard,
  );

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
    const enable = () => void enableIncomingMessageSound();
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
          setNeedsInvite(caught instanceof MissingMembershipError);
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
        setVoiceSessions([...nextVoiceSessions]);
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
    void presenceSubscriptionRef.current?.setVoiceChannel(activeVoiceChannelId);
  }, [activeVoiceChannelId]);

  useEffect(() => {
    if (voice.status === "disconnected") setSoundboardOpen(false);
  }, [voice.status]);

  const selectedChannel = useMemo(
    () =>
      workspace?.channels.find((channel) => channel.id === selectedChannelId) ??
      null,
    [selectedChannelId, workspace],
  );
  const openedProfileMember =
    workspace?.members.find((member) => member.id === openProfile?.memberId) ??
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
            },
          ]
        : [];
    });
  }, [voiceSessions, workspace]);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);

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
          void playIncomingMessageSound();
        }
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [channelKey, signedInUserId]);

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

  function handleThemeChange(preference: ThemePreference) {
    const next = { ...appearancePreferences, theme: preference };
    setAppearancePreferences(next);
    persistAppearancePreferences(next);
  }

  function handleAccentChange(accent: AccentColor, intensity: number) {
    const next = { ...appearancePreferences, accent, intensity };
    setAppearancePreferences(next);
    persistAppearancePreferences(next);
  }

  function handleSurfaceStyleChange(surfaceStyle: SurfaceStyle) {
    const next = { ...appearancePreferences, surfaceStyle };
    setAppearancePreferences(next);
    persistAppearancePreferences(next);
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
            name: name.trim(),
            kind,
            position:
              Math.max(
                -10,
                ...workspace.channels
                  .filter((candidate) => candidate.kind === kind)
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
    await voice.leave();
    await presenceSubscriptionRef.current?.setVoiceChannel(null);
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

  function handleSelectChannel(channel: Channel) {
    setOpenProfile(null);
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

  if (authLoading) {
    return (
      <main className="app-loading">
        <span className="brand-mark">
          <MessageCircle size={24} />
        </span>
        <h1>Opening Bakbak</h1>
        <p>Checking whether you already have a seat…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        mode={appConfig.dataMode}
        configurationWarning={appConfig.configurationWarning}
        onAuthenticated={setUser}
        onEnterMock={() => setUser(mockCurrentUser)}
      />
    );
  }

  if (needsInvite && appConfig.dataMode === "live") {
    return (
      <InviteGate
        user={user}
        onRedeemed={() => {
          setNeedsInvite(false);
          setWorkspaceRevision((current) => current + 1);
        }}
        onSignOut={() => void handleSignOut().catch(() => undefined)}
      />
    );
  }

  if (!workspace || !selectedChannel) {
    return (
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
      </main>
    );
  }

  return (
    <div
      className="desktop-shell"
      data-left-panel={
        layoutPreferences.leftPanelVisible ? "visible" : "hidden"
      }
      data-right-panel={
        layoutPreferences.rightPanelVisible ? "visible" : "hidden"
      }
    >
      {layoutPreferences.leftPanelVisible ? (
        <ChannelSidebar
          server={workspace.server}
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
      ) : null}
      <main className="content-shell">
        <TopBar
          channel={selectedChannel}
          leftPanelVisible={layoutPreferences.leftPanelVisible}
          rightPanelVisible={layoutPreferences.rightPanelVisible}
          onToggleLeftPanel={() =>
            updateLayoutPreferences((current) => ({
              ...current,
              leftPanelVisible: !current.leftPanelVisible,
            }))
          }
          onToggleRightPanel={() =>
            updateLayoutPreferences((current) => ({
              ...current,
              rightPanelVisible: !current.rightPanelVisible,
            }))
          }
        />
        <div className="content-stage">
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
            {selectedChannel.kind === "text" ? (
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
            ) : (
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
            )}
          </div>
        </div>
        {soundboardOpen && visibleVoice.status === "connected" ? (
          <aside
            className={`soundboard-drawer ${selectedChannel.kind === "text" ? "is-over-text" : ""}`}
            id="soundboard-drawer"
            aria-label="Soundboard"
          >
            <Soundboard
              connected
              deafened={voice.deafened}
              categories={voice.soundboard.categories}
              sounds={voice.soundboard.sounds}
              loading={voice.soundboard.loading}
              error={voice.soundboard.error}
              volume={voice.soundboardVolume}
              activeLocalSoundCount={voice.activeLocalSoundCount}
              maxConcurrentSounds={voice.maxConcurrentSounds}
              onPlay={voice.dispatchSound}
              onStopAll={voice.stopLocalSounds}
              onVolumeChange={voice.setSoundboardVolume}
              onRetry={voice.soundboard.retrySound}
              onUpdate={voice.updateSoundMetadata}
            />
          </aside>
        ) : null}
        {activeView === "channel" ? (
          <VoiceControlDock
            voice={visibleVoice}
            soundboardOpen={soundboardOpen}
            overTextChannel={selectedChannel.kind === "text"}
            onToggleSoundboard={toggleSoundboard}
            onOpenDevices={() => openSettings("audio")}
            onOpenScreenShare={() => {
              setOpenProfile(null);
              setScreenShareDialogOpen(true);
            }}
          />
        ) : null}
      </main>
      {layoutPreferences.rightPanelVisible ? (
        <MemberPanel
          members={workspace.members}
          loadProfileMedia={loadProfileMedia}
          onOpenProfile={handleOpenProfile}
          openProfileId={openProfile?.memberId ?? null}
        />
      ) : null}
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
          onStart={(includeAudio) => void voice.startScreenShare(includeAudio)}
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
          themePreference={appearancePreferences.theme}
          accent={appearancePreferences.accent}
          accentIntensity={appearancePreferences.intensity}
          surfaceStyle={appearancePreferences.surfaceStyle}
          inputDevices={voice.inputDevices}
          outputDevices={voice.outputDevices}
          cameraDevices={voice.cameraDevices}
          selectedInputId={voice.selectedInputId}
          selectedOutputId={voice.selectedOutputId}
          selectedCameraId={voice.selectedCameraId}
          soundboardVolume={voice.soundboardVolume}
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
          onThemeChange={handleThemeChange}
          onAccentChange={handleAccentChange}
          onSurfaceStyleChange={handleSurfaceStyleChange}
          onSaveProfile={handleSaveProfile}
          loadProfileMedia={loadProfileMedia}
          onInputChange={(deviceId) => void voice.setInputDevice(deviceId)}
          onOutputChange={(deviceId) => void voice.setOutputDevice(deviceId)}
          onCameraChange={(deviceId) => void voice.setCameraDevice(deviceId)}
          onSoundboardVolumeChange={voice.setSoundboardVolume}
          onSignOut={handleSignOut}
          onClose={() => setActiveView("channel")}
        />
      ) : null}
    </div>
  );
}

function TopBar({
  channel,
  leftPanelVisible,
  rightPanelVisible,
  onToggleLeftPanel,
  onToggleRightPanel,
}: {
  channel: Channel;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="top-bar__leading">
        <button
          className="panel-toggle"
          type="button"
          aria-label={
            leftPanelVisible ? "Hide channel panel" : "Show channel panel"
          }
          aria-controls="channel-sidebar"
          aria-expanded={leftPanelVisible}
          onClick={onToggleLeftPanel}
        >
          {leftPanelVisible ? (
            <PanelLeftClose size={18} />
          ) : (
            <PanelLeftOpen size={18} />
          )}
        </button>
        <div className="top-bar__channel">
          {channel.kind === "text" ? <Hash size={20} /> : <Volume2 size={20} />}
          <div>
            <strong>{channel.name}</strong>
            <span>{channel.topic}</span>
          </div>
        </div>
      </div>
      <div className="top-bar__actions">
        <button
          className="panel-toggle"
          type="button"
          aria-label={
            rightPanelVisible ? "Hide member panel" : "Show member panel"
          }
          aria-controls="member-panel"
          aria-expanded={rightPanelVisible}
          onClick={onToggleRightPanel}
        >
          {rightPanelVisible ? (
            <PanelRightClose size={18} />
          ) : (
            <PanelRightOpen size={18} />
          )}
        </button>
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
