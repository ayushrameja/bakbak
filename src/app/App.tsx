import {
  CircleAlert,
  Hash,
  MessageCircle,
  MessageSquareText,
  UserRound,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../components/Avatar";
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
import { ConnectionStatus } from "../features/server/ConnectionStatus";
import { PeopleDrawer } from "../features/server/PeopleDrawer";
import {
  loadAppearancePreferences,
  setAppearancePreferences as persistAppearancePreferences,
  type AccentColor,
  type AppearancePreferences,
  type ThemePreference,
} from "../features/settings/appearance-preferences";
import {
  SettingsPage,
  type ProfileSaveInput,
  type SettingsSection,
} from "../features/settings/SettingsPage";
import { Soundboard } from "../features/soundboard/Soundboard";
import { useSoundboardCatalog } from "../features/soundboard/useSoundboardCatalog";
import { ScreenShareDialog } from "../features/voice/ScreenShareDialog";
import { VoiceControlBar } from "../features/voice/VoiceControlBar";
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
  downloadAvatarObjectUrl,
  saveLiveProfile,
  subscribeToProfileChanges,
} from "../lib/profile-service";
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
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [channelDialog, setChannelDialog] = useState<ChannelDialogState>(null);
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const [voiceChatOpen, setVoiceChatOpen] = useState(true);
  const [screenShareDialogOpen, setScreenShareDialogOpen] = useState(false);
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
  const voiceChatOpenRef = useRef(voiceChatOpen);
  const presenceSubscriptionRef = useRef<ServerPresenceSubscription | null>(
    null,
  );
  const avatarObjectUrlsRef = useRef(new Map<string, string>());
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

  useEffect(
    () => () => {
      avatarObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      avatarObjectUrlsRef.current.clear();
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
              avatarPath: current.avatarPath ?? null,
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
      setWorkspace(null);
      setNeedsInvite(false);
      setSelectedChannelId("");
      setMessages([]);
      setDrafts({});
      setUnreadChannelIds(new Set());
      setLatestMessageIds({});
      setVoiceChatOpen(true);
      setVoiceSessions([]);
      setActiveView("channel");
      setPeopleOpen(false);
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
              current.avatarPath === currentMember.avatarPath
            ) {
              return current;
            }
            return {
              ...current,
              displayName: currentMember.displayName,
              avatarUrl: currentMember.avatarUrl,
              avatarPath: currentMember.avatarPath ?? null,
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
                    ? {
                        ...member,
                        displayName: profile.display_name,
                        avatarPath: profile.avatar_path,
                        avatarUrl: avatarResolved
                          ? avatarUrl
                          : member.avatarUrl,
                      }
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

  const visibleVoice = useMemo(() => {
    if (!voice.channel || !workspace) return voice;
    const latestChannel = workspace.channels.find(
      (channel) => channel.id === voice.channel?.id,
    );
    return latestChannel ? { ...voice, channel: latestChannel } : voice;
  }, [voice, workspace]);

  const channelIds = useMemo(
    () => workspace?.channels.map((channel) => channel.id) ?? [],
    [workspace?.channels],
  );
  const channelKey = channelIds.join("|");
  const channelKinds = useMemo(
    () =>
      new Map(
        workspace?.channels.map((channel) => [channel.id, channel.kind]) ?? [],
      ),
    [workspace?.channels],
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

  useEffect(() => {
    voiceChatOpenRef.current = voiceChatOpen;
  }, [voiceChatOpen]);

  const refreshChannelActivity = useCallback(async () => {
    if (
      appConfig.dataMode !== "live" ||
      !workspaceServerId ||
      !signedInUserId
    ) {
      return;
    }
    const activity = await loadLiveChannelActivity(workspaceServerId);
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
  }, [signedInUserId, workspaceServerId]);

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
        const visible =
          selected &&
          activeViewRef.current === "channel" &&
          (channelKinds.get(message.channelId) === "text" ||
            voiceChatOpenRef.current);
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
  }, [channelKey, channelKinds, signedInUserId]);

  const selectedMessageChannelId = selectedChannel?.id ?? null;
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
    if (!selectedChannel || activeView !== "channel") return;
    if (selectedChannel.kind === "voice" && !voiceChatOpen) return;
    const latestMessageId = latestMessageIds[selectedChannel.id];
    setUnreadChannelIds((current) =>
      markChannelRead(current, selectedChannel.id),
    );
    if (appConfig.dataMode === "live" && latestMessageId) {
      void markLiveChannelRead(selectedChannel.id, latestMessageId).catch(
        () => undefined,
      );
    }
  }, [activeView, latestMessageIds, selectedChannel, voiceChatOpen]);

  const handleSend = useCallback(
    async (draft: MessageDraft) => {
      if (!user || !selectedChannel) return;
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
    setSettingsSection(section);
    setActiveView("settings");
    setPeopleOpen(false);
  }

  const closePeople = useCallback(() => setPeopleOpen(false), []);
  const toggleSoundboard = useCallback(
    () => setSoundboardOpen((open) => !open),
    [],
  );

  async function handleSaveProfile(input: ProfileSaveInput) {
    if (!user) throw new Error("Sign in before editing your profile.");
    let displayName = input.displayName.trim();
    let avatarPath = user.avatarPath ?? null;
    let avatarUrl = user.avatarUrl;
    let warning: string | undefined;

    if (appConfig.dataMode === "live") {
      const saved = await saveLiveProfile({
        userId: user.id,
        displayName,
        currentAvatarPath: avatarPath,
        currentAvatarUrl: avatarUrl,
        avatarFile: input.avatarFile,
        removeAvatar: input.removeAvatar,
      });
      displayName = saved.displayName;
      avatarPath = saved.avatarPath;
      avatarUrl = saved.avatarUrl;
      warning = saved.metadataWarning ?? undefined;
    } else if (input.removeAvatar) {
      avatarPath = null;
      avatarUrl = null;
    } else if (input.avatarFile) {
      avatarPath = `mock/${crypto.randomUUID()}`;
      avatarUrl = await fileToDataUrl(input.avatarFile);
    }

    rememberAvatarUrl(user.id, avatarUrl);
    setUser((current) =>
      current ? { ...current, displayName, avatarPath, avatarUrl } : current,
    );
    setWorkspace((current) =>
      current
        ? {
            ...current,
            members: current.members.map((member) =>
              member.id === user.id
                ? { ...member, displayName, avatarPath, avatarUrl }
                : member,
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
    setPeopleOpen(false);
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
    selectedChannelIdRef.current = channel.id;
    setSelectedChannelId(channel.id);
    if (channel.kind === "voice") setVoiceChatOpen(true);
    setActiveView("channel");
    setPeopleOpen(false);
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
    <div className="desktop-shell">
      <ChannelSidebar
        server={workspace.server}
        channels={workspace.channels}
        selectedChannelId={selectedChannel.id}
        user={user}
        voiceOccupants={voiceOccupants}
        unreadChannelIds={unreadChannelIds}
        canManageChannels={workspace.currentUserRole === "admin"}
        onSelect={handleSelectChannel}
        onCreateChannel={(kind) => setChannelDialog({ mode: "create", kind })}
        onRenameChannel={(channel) =>
          setChannelDialog({ mode: "rename", channel })
        }
        onOpenSettings={() => openSettings("profile")}
      />
      <main
        className={`content-shell ${visibleVoice.status !== "disconnected" ? "has-voice-bar" : ""}`}
      >
        <TopBar
          channel={selectedChannel}
          view="channel"
          members={workspace.members}
          mode={appConfig.dataMode}
          voiceConnected={voice.status === "connected"}
          onOpenPeople={() => setPeopleOpen(true)}
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
              />
            ) : (
              <div
                className={`voice-channel-layout ${voiceChatOpen ? "is-chat-open" : ""}`}
              >
                <VoiceRoom
                  channel={selectedChannel}
                  user={user}
                  members={workspace.members}
                  voice={voice}
                  occupants={voiceOccupants.filter(
                    (occupant) => occupant.channelId === selectedChannel.id,
                  )}
                  onOpenSettings={() => openSettings("audio")}
                />
                <button
                  className={`voice-chat-toggle ${unreadChannelIds.has(selectedChannel.id) ? "has-unread" : ""}`}
                  type="button"
                  aria-expanded={voiceChatOpen}
                  aria-controls="voice-chat-dock"
                  onClick={() => setVoiceChatOpen((open) => !open)}
                >
                  <MessageSquareText size={16} />
                  {voiceChatOpen ? "Hide chat" : "Show chat"}
                </button>
                {voiceChatOpen ? (
                  <aside
                    className="voice-chat-dock"
                    id="voice-chat-dock"
                    aria-label={`${selectedChannel.name} chat`}
                  >
                    <ChatView
                      compact
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
                    />
                  </aside>
                ) : null}
              </div>
            )}
          </div>
        </div>
        {soundboardOpen && visibleVoice.status === "connected" ? (
          <aside
            className="soundboard-drawer"
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
              onPlay={voice.dispatchSound}
              onStopAll={voice.stopLocalSounds}
              onVolumeChange={voice.setSoundboardVolume}
              onRetry={voice.soundboard.retrySound}
              onUpdate={voice.updateSoundMetadata}
            />
          </aside>
        ) : null}
        <VoiceControlBar
          voice={visibleVoice}
          soundboardOpen={soundboardOpen}
          onToggleSoundboard={toggleSoundboard}
          onOpenDevices={() => openSettings("audio")}
          onOpenScreenShare={() => setScreenShareDialogOpen(true)}
        />
      </main>
      <PeopleDrawer
        members={workspace.members}
        open={peopleOpen}
        onClose={closePeople}
      />
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
          onSaveProfile={handleSaveProfile}
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
  view,
  members,
  mode,
  voiceConnected,
  onOpenPeople,
}: {
  channel: Channel;
  view: AppView;
  members: WorkspaceSnapshot["members"];
  mode: "mock" | "live";
  voiceConnected: boolean;
  onOpenPeople: () => void;
}) {
  const activeMembers = members.filter((member) => member.status !== "offline");
  return (
    <header className="top-bar">
      <div className="top-bar__channel">
        {view === "settings" ? (
          <UserRound size={20} />
        ) : channel.kind === "text" ? (
          <Hash size={20} />
        ) : (
          <Volume2 size={20} />
        )}
        <div>
          <strong>
            {view === "settings" ? "Your settings" : channel.name}
          </strong>
          <span>
            {view === "settings"
              ? "A few choices that stay yours."
              : channel.topic}
          </span>
        </div>
      </div>
      <div className="top-bar__actions">
        <ConnectionStatus
          mode={mode}
          backendUrl={appConfig.supabaseUrl}
          backendRegion={appConfig.backendRegion}
          voiceConnected={voiceConnected}
        />
        <button
          className="people-trigger"
          type="button"
          onClick={onOpenPeople}
          aria-label={`Open people, ${activeMembers.length} online`}
        >
          <span className="people-trigger__avatars" aria-hidden="true">
            {activeMembers.slice(0, 3).map((member) => (
              <Avatar user={member} size="small" key={member.id} />
            ))}
          </span>
          <span>{activeMembers.length} here</span>
        </button>
      </div>
    </header>
  );
}

function fileToDataUrl(file: File): Promise<string> {
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
