import { Hash, LogOut, Pencil, Plus, Settings, Volume2 } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type {
  AppUser,
  Channel,
  ChannelKind,
  Server,
  VoiceRoomOccupant,
} from "../../lib/types";
import { VoiceElapsedTime } from "../voice/VoiceElapsedTime";

interface ChannelSidebarProps {
  server: Server;
  channels: Channel[];
  selectedChannelId: string;
  user: AppUser;
  voiceOccupants: VoiceRoomOccupant[];
  unreadChannelIds: ReadonlySet<string>;
  canManageChannels: boolean;
  onSelect: (channel: Channel) => void;
  onCreateChannel: (kind: ChannelKind) => void;
  onRenameChannel: (channel: Channel) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  user,
  voiceOccupants,
  unreadChannelIds,
  canManageChannels,
  onSelect,
  onCreateChannel,
  onRenameChannel,
  onOpenSettings,
  onSignOut,
}: ChannelSidebarProps) {
  const textChannels = channels.filter((channel) => channel.kind === "text");
  const voiceChannels = channels.filter((channel) => channel.kind === "voice");

  return (
    <aside className="channel-sidebar">
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

      <div className="user-dock">
        <Avatar user={user} size="small" showStatus />
        <div className="user-dock__identity">
          <strong>{user.displayName}</strong>
          <span>Available</span>
        </div>
        <button type="button" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={16} />
        </button>
        <button type="button" onClick={onSignOut} aria-label="Sign out">
          <LogOut size={16} />
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
