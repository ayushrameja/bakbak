import {
  Hash,
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Settings,
  Volume2,
} from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type {
  AppUser,
  Channel,
  ChannelKind,
  DataMode,
  Server,
  VoiceRoomOccupant,
} from "../../lib/types";
import { VoiceElapsedTime } from "../voice/VoiceElapsedTime";
import { SidebarVoicePanel } from "../voice/SidebarVoicePanel";
import type { useVoiceRoom } from "../voice/useVoiceRoom";

interface ChannelSidebarProps {
  server: Server;
  channels: Channel[];
  selectedChannelId: string;
  user: AppUser;
  voiceOccupants: VoiceRoomOccupant[];
  unreadChannelIds: ReadonlySet<string>;
  voice: ReturnType<typeof useVoiceRoom>;
  mode: DataMode;
  soundboardOpen: boolean;
  canManageChannels: boolean;
  onSelect: (channel: Channel) => void;
  onPrepareVoiceChannel: (channel: Channel) => void;
  onCreateChannel: (kind: ChannelKind) => void;
  onRenameChannel: (channel: Channel) => void;
  onOpenSettings: () => void;
  onToggleSoundboard: () => void;
  onOpenScreenShare: () => void;
}

export function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  user,
  voiceOccupants,
  unreadChannelIds,
  voice,
  mode,
  soundboardOpen,
  canManageChannels,
  onSelect,
  onPrepareVoiceChannel,
  onCreateChannel,
  onRenameChannel,
  onOpenSettings,
  onToggleSoundboard,
  onOpenScreenShare,
}: ChannelSidebarProps) {
  const textChannels = channels.filter((channel) => channel.kind === "text");
  const voiceChannels = channels.filter((channel) => channel.kind === "voice");

  return (
    <aside className="channel-sidebar" id="channel-sidebar">
      <header className="server-switcher">
        <div>
          <strong>{server.name}</strong>
          <span>Friends-only adda</span>
        </div>
      </header>
      <nav className="channel-nav" aria-label="Channels">
        <ChannelGroup
          label="Conversations"
          onAdd={canManageChannels ? () => onCreateChannel("text") : undefined}
        >
          {textChannels.map((channel) => (
            <div className="channel-row-wrap" key={channel.id}>
              <button
                className={`channel-row ${selectedChannelId === channel.id ? "active" : ""} ${unreadChannelIds.has(channel.id) ? "channel-row--unread" : ""}`}
                type="button"
                onClick={() => onSelect(channel)}
              >
                <Hash size={17} />
                <span>{channel.name}</span>
              </button>
              {canManageChannels ? (
                <button
                  className="channel-row-edit"
                  type="button"
                  aria-label={`Rename ${channel.name}`}
                  onClick={() => onRenameChannel(channel)}
                >
                  <Pencil size={13} />
                </button>
              ) : null}
            </div>
          ))}
        </ChannelGroup>
        <ChannelGroup
          label="Voice rooms"
          onAdd={canManageChannels ? () => onCreateChannel("voice") : undefined}
        >
          {voiceChannels.map((channel) => (
            <div className="channel-row-wrap" key={channel.id}>
              {(() => {
                const occupants = voiceOccupants.filter(
                  (occupant) => occupant.channelId === channel.id,
                );
                return (
                  <div className="channel-row-stack">
                    <button
                      className={`channel-row ${selectedChannelId === channel.id ? "active" : ""}`}
                      type="button"
                      onPointerEnter={() => onPrepareVoiceChannel(channel)}
                      onFocus={() => onPrepareVoiceChannel(channel)}
                      onClick={() => onSelect(channel)}
                    >
                      <Volume2 size={17} />
                      <span>{channel.name}</span>
                      {occupants.length > 0 ? <i className="live-dot" /> : null}
                    </button>
                    {canManageChannels ? (
                      <button
                        className="channel-row-edit"
                        type="button"
                        aria-label={`Rename ${channel.name}`}
                        onClick={() => onRenameChannel(channel)}
                      >
                        <Pencil size={13} />
                      </button>
                    ) : null}
                    {occupants.length > 0 ? (
                      <div className="channel-voice-people">
                        {occupants.map((occupant) => (
                          <span key={occupant.userId}>
                            <i />
                            <b>
                              {occupant.displayName}
                              {occupant.userId === user.id ? " (you)" : ""}
                            </b>
                            <VoiceElapsedTime joinedAt={occupant.joinedAt} />
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          ))}
        </ChannelGroup>
      </nav>

      <div className="sidebar-spacer" />

      <SidebarVoicePanel
        voice={voice}
        mode={mode}
        soundboardOpen={soundboardOpen}
        onToggleSoundboard={onToggleSoundboard}
        onOpenScreenShare={onOpenScreenShare}
      />

      <div className="user-dock">
        <Avatar user={user} size="small" showStatus />
        <div className="user-dock__identity">
          <strong>{user.displayName}</strong>
          <span>{voice.status === "connected" ? "In voice" : "Available"}</span>
        </div>
        {voice.status !== "disconnected" ? (
          <>
            <button
              className={voice.muted ? "is-active" : ""}
              type="button"
              disabled={voice.status !== "connected"}
              onClick={() => void voice.toggleMute()}
              aria-label={voice.muted ? "Unmute" : "Mute"}
            >
              {voice.muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              className={voice.deafened ? "is-active" : ""}
              type="button"
              disabled={voice.status !== "connected"}
              onClick={() => void voice.toggleDeafen()}
              aria-label={voice.deafened ? "Undeafen" : "Deafen"}
            >
              {voice.deafened ? (
                <HeadphoneOff size={16} />
              ) : (
                <Headphones size={16} />
              )}
            </button>
          </>
        ) : null}
        <button type="button" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
}

function ChannelGroup({
  label,
  onAdd,
  children,
}: {
  label: string;
  onAdd?: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="channel-group">
      <header>
        <span>{label}</span>
        {onAdd ? (
          <button type="button" aria-label={`Create ${label}`} onClick={onAdd}>
            <Plus size={14} />
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}
