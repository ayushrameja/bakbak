import {
  Bell,
  CircleAlert,
  Command,
  Hash,
  HelpCircle,
  MessageCircle,
  Pin,
  Plus,
  Search,
  Users,
  Volume2,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { AuthScreen } from "../features/auth/AuthScreen";
import { InviteGate } from "../features/auth/InviteGate";
import { ChannelSidebar } from "../features/channels/ChannelSidebar";
import { ChatView } from "../features/chat/ChatView";
import { MemberList } from "../features/server/MemberList";
import { SettingsModal } from "../features/settings/SettingsModal";
import { VoiceRoom } from "../features/voice/VoiceRoom";
import { useVoiceRoom } from "../features/voice/useVoiceRoom";
import { sessionToAppUser, signOut } from "../lib/auth-service";
import { appConfig } from "../lib/env";
import { mockCurrentUser, mockMessages, mockWorkspace } from "../lib/mock-data";
import { getSupabaseClient } from "../lib/supabase";
import type {
  AppUser,
  Channel,
  ChatMessage,
  WorkspaceSnapshot,
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
  const voice = useVoiceRoom(user ?? mockCurrentUser, appConfig.dataMode);

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

  const selectedChannel = useMemo(
    () =>
      workspace?.channels.find((channel) => channel.id === selectedChannelId) ??
      null,
    [selectedChannelId, workspace],
  );

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
    const unsubscribe =
      appConfig.dataMode === "live"
        ? subscribeToLiveMessages(selectedChannel.id, (message) => {
            setMessages((current) =>
              current.some((item) => item.id === message.id)
                ? current
                : [...current, message],
            );
          })
        : undefined;
    return () => {
      cancelled = true;
      unsubscribe?.();
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
      <ServerRail currentUser={user} />
      <ChannelSidebar
        server={workspace.server}
        channels={workspace.channels}
        selectedChannelId={selectedChannel.id}
        user={user}
        voice={voice}
        onSelect={handleSelectChannel}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={() => void handleSignOut()}
      />
      <main className="content-shell">
        <TopBar
          channel={selectedChannel}
          memberCount={workspace.members.length}
          mode={appConfig.dataMode}
        />
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
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>
      </main>
      {settingsOpen ? (
        <SettingsModal
          inputDevices={voice.inputDevices}
          selectedInputId={voice.selectedInputId}
          onInputChange={(deviceId) => void voice.setInputDevice(deviceId)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ServerRail({ currentUser }: { currentUser: AppUser }) {
  return (
    <aside className="server-rail" aria-label="Servers">
      <button
        className="server-rail__home active"
        type="button"
        aria-label="Bakbak home"
      >
        <MessageCircle size={23} />
      </button>
      <div className="server-rail__divider" />
      <button
        className="server-rail__server"
        type="button"
        aria-label="The Corner"
      >
        <span>TC</span>
        <i />
      </button>
      <button
        className="server-rail__add"
        type="button"
        aria-label="Add server"
        disabled
        title="One server in v1"
      >
        <Plus size={20} />
      </button>
      <div className="server-rail__spacer" />
      <button className="server-rail__utility" type="button" aria-label="Help">
        <HelpCircle size={18} />
      </button>
      <Avatar user={currentUser} size="small" />
    </aside>
  );
}

function TopBar({
  channel,
  memberCount,
  mode,
}: {
  channel: Channel;
  memberCount: number;
  mode: "mock" | "live";
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
        <span className={`connection-chip connection-chip--${mode}`}>
          <Wifi size={13} /> {mode === "mock" ? "Local preview" : "Live"}
        </span>
        <button type="button" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button type="button" aria-label="Pinned messages">
          <Pin size={18} />
        </button>
        <button type="button" aria-label={`${memberCount} members`}>
          <Users size={18} />
          <span>{memberCount}</span>
        </button>
        <label className="search-field">
          <Search size={15} />
          <input aria-label="Search messages" placeholder="Search" />
          <kbd>
            <Command size={11} />K
          </kbd>
        </label>
      </div>
    </header>
  );
}
