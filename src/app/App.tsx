import { CircleAlert, Hash, MessageCircle, Users, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen } from "../features/auth/AuthScreen";
import { InviteGate } from "../features/auth/InviteGate";
import { ChannelSidebar } from "../features/channels/ChannelSidebar";
import {
  markChannelRead,
  shouldPlayIncomingMessageSound,
  unreadChannelsAfterMessage,
} from "../features/chat/channel-activity";
import { ChatView } from "../features/chat/ChatView";
import {
  enableIncomingMessageSound,
  playIncomingMessageSound,
} from "../features/chat/message-sound";
import { MemberList } from "../features/server/MemberList";
import { ConnectionStatus } from "../features/server/ConnectionStatus";
import { SettingsModal } from "../features/settings/SettingsModal";
import { VoiceRoom } from "../features/voice/VoiceRoom";
import { useVoiceRoom } from "../features/voice/useVoiceRoom";
import { sessionToAppUser, signOut } from "../lib/auth-service";
import { appConfig } from "../lib/env";
import { mockCurrentUser, mockMessages, mockWorkspace } from "../lib/mock-data";
import { getSupabaseClient } from "../lib/supabase";
import {
  subscribeToServerPresence,
  type ServerPresenceSubscription,
  type VoicePresenceSession,
} from "../lib/presence-service";
import type {
  AppUser,
  Channel,
  ChatMessage,
  WorkspaceSnapshot,
  VoiceRoomOccupant,
} from "../lib/types";
import {
  loadLiveMessages,
  loadLiveWorkspace,
  MissingMembershipError,
  sendLiveMessage,
  subscribeToLiveMessages,
} from "../lib/workspace-service";

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(appConfig.dataMode === "live");
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needsInvite, setNeedsInvite] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [unreadChannelIds, setUnreadChannelIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [voiceSessions, setVoiceSessions] = useState<VoicePresenceSession[]>(
    [],
  );
  const selectedChannelIdRef = useRef(selectedChannelId);
  const presenceSubscriptionRef = useRef<ServerPresenceSubscription | null>(
    null,
  );
  const voice = useVoiceRoom(user ?? mockCurrentUser, appConfig.dataMode);
  const workspaceServerId = workspace?.server.id;

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
      setUser(session ? sessionToAppUser(session) : null);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setWorkspace(null);
      setNeedsInvite(false);
      setSelectedChannelId("");
      setMessages([]);
      setUnreadChannelIds(new Set());
      setVoiceSessions([]);
      return;
    }
    let cancelled = false;
    setAppError(null);
    const load = async () => {
      try {
        const snapshot =
          appConfig.dataMode === "mock"
            ? mockWorkspace
            : await loadLiveWorkspace(user);
        if (cancelled) return;
        setWorkspace(snapshot);
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
  }, [user, workspaceRevision]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !user || !workspaceServerId) {
      return;
    }

    const subscription = subscribeToServerPresence({
      serverId: workspaceServerId,
      userId: user.id,
      onSync: ({ onlineUserIds, voiceSessions: nextVoiceSessions }) => {
        setVoiceSessions([...nextVoiceSessions]);
        setWorkspace((current) => {
          if (!current || current.server.id !== workspaceServerId)
            return current;
          const members = current.members.map((member) => ({
            ...member,
            status:
              member.id === user.id || onlineUserIds.has(member.id)
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
  }, [user, workspaceServerId]);

  const activeVoiceChannelId =
    voice.channel &&
    (voice.status === "connected" || voice.status === "reconnecting")
      ? voice.channel.id
      : null;

  useEffect(() => {
    void presenceSubscriptionRef.current?.setVoiceChannel(activeVoiceChannelId);
  }, [activeVoiceChannelId]);

  const selectedChannel = useMemo(
    () =>
      workspace?.channels.find((channel) => channel.id === selectedChannelId) ??
      null,
    [selectedChannelId, workspace],
  );

  const textChannelIds = useMemo(
    () =>
      workspace?.channels
        .filter((channel) => channel.kind === "text")
        .map((channel) => channel.id) ?? [],
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
    if (selectedChannelId) {
      setUnreadChannelIds((current) =>
        markChannelRead(current, selectedChannelId),
      );
    }
  }, [selectedChannelId]);

  useEffect(() => {
    if (appConfig.dataMode !== "live" || !user) return;
    const unsubscribers = textChannelIds.map((channelId) =>
      subscribeToLiveMessages(channelId, (message) => {
        if (message.channelId === selectedChannelIdRef.current) {
          setMessages((current) =>
            current.some((item) => item.id === message.id)
              ? current
              : [...current, message],
          );
        }
        setUnreadChannelIds((current) =>
          unreadChannelsAfterMessage(
            current,
            message,
            selectedChannelIdRef.current,
            user.id,
          ),
        );
        if (shouldPlayIncomingMessageSound(message, user.id)) {
          void playIncomingMessageSound();
        }
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [textChannelIds, user]);

  useEffect(() => {
    if (!user || !selectedChannel || selectedChannel.kind !== "text") return;
    let cancelled = false;
    setAppError(null);
    const load = async () => {
      try {
        const nextMessages =
          appConfig.dataMode === "mock"
            ? mockMessages.filter(
                (message) => message.channelId === selectedChannel.id,
              )
            : await loadLiveMessages(selectedChannel.id);
        if (!cancelled) setMessages(nextMessages);
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
  }, [selectedChannel, user]);

  const handleSend = useCallback(
    async (body: string) => {
      if (!user || !selectedChannel || selectedChannel.kind !== "text") return;
      setSending(true);
      setAppError(null);
      const optimisticId = `pending-${crypto.randomUUID()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        channelId: selectedChannel.id,
        authorId: user.id,
        body,
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
          const saved = await sendLiveMessage(selectedChannel.id, body);
          setMessages((current) => [
            ...current.filter(
              (message) =>
                message.id !== optimisticId && message.id !== saved.id,
            ),
            saved,
          ]);
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

  async function handleSignOut() {
    await voice.leave();
    await presenceSubscriptionRef.current?.setVoiceChannel(null);
    if (appConfig.dataMode === "live") {
      try {
        await signOut();
      } catch (caught) {
        setAppError(
          caught instanceof Error ? caught.message : "Sign out failed.",
        );
        return;
      }
    }
    setUser(null);
  }

  function handleSelectChannel(channel: Channel) {
    selectedChannelIdRef.current = channel.id;
    setUnreadChannelIds((current) => markChannelRead(current, channel.id));
    setSelectedChannelId(channel.id);
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
        onSignOut={() => void handleSignOut()}
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
            onClick={() => void handleSignOut()}
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
        voice={voice}
        voiceOccupants={voiceOccupants}
        unreadChannelIds={unreadChannelIds}
        onSelect={handleSelectChannel}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={() => void handleSignOut()}
      />
      <main className="content-shell">
        <TopBar
          channel={selectedChannel}
          memberCount={workspace.members.length}
          mode={appConfig.dataMode}
          voiceConnected={voice.status === "connected"}
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
              <>
                <ChatView
                  channel={selectedChannel}
                  messages={messages}
                  members={workspace.members}
                  currentUser={user}
                  sending={sending}
                  onSend={handleSend}
                />
                <MemberList members={workspace.members} />
              </>
            ) : (
              <VoiceRoom
                channel={selectedChannel}
                user={user}
                voice={voice}
                occupants={voiceOccupants.filter(
                  (occupant) => occupant.channelId === selectedChannel.id,
                )}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            )}
          </div>
        </div>
      </main>
      {settingsOpen ? (
        <SettingsModal
          inputDevices={voice.inputDevices}
          outputDevices={voice.outputDevices}
          cameraDevices={voice.cameraDevices}
          selectedInputId={voice.selectedInputId}
          selectedOutputId={voice.selectedOutputId}
          selectedCameraId={voice.selectedCameraId}
          inputError={voice.inputDeviceError}
          outputError={voice.outputDeviceError}
          cameraError={voice.cameraDeviceError}
          outputSelectionSupported={voice.outputSelectionSupported}
          inputDisabled={
            voice.status === "connecting" || voice.status === "reconnecting"
          }
          onInputChange={(deviceId) => void voice.setInputDevice(deviceId)}
          onOutputChange={(deviceId) => void voice.setOutputDevice(deviceId)}
          onCameraChange={(deviceId) => void voice.setCameraDevice(deviceId)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TopBar({
  channel,
  memberCount,
  mode,
  voiceConnected,
}: {
  channel: Channel;
  memberCount: number;
  mode: "mock" | "live";
  voiceConnected: boolean;
}) {
  return (
    <header className="top-bar">
      <div className="top-bar__channel">
        {channel.kind === "text" ? <Hash size={20} /> : <Volume2 size={20} />}
        <div>
          <strong>{channel.name}</strong>
          <span>{channel.topic}</span>
        </div>
      </div>
      <div className="top-bar__actions">
        <ConnectionStatus
          mode={mode}
          backendUrl={appConfig.supabaseUrl}
          backendRegion={appConfig.backendRegion}
          voiceConnected={voiceConnected}
        />
        <span
          className="top-bar__member-count"
          aria-label={`${memberCount} members`}
        >
          <Users size={18} />
          <span>{memberCount}</span>
        </span>
      </div>
    </header>
  );
}
