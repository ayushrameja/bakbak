import {
  Hash,
  HeadphoneOff,
  Headphones,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  Settings,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type {
  AppUser,
  Channel,
  Server,
  VoiceRoomOccupant,
} from "../../lib/types";
import { VoiceElapsedTime } from "../voice/VoiceElapsedTime";
import type { useVoiceRoom } from "../voice/useVoiceRoom";

interface ChannelSidebarProps {
  server: Server;
  channels: Channel[];
  selectedChannelId: string;
  user: AppUser;
  voice: ReturnType<typeof useVoiceRoom>;
  voiceOccupants: VoiceRoomOccupant[];
  unreadChannelIds: ReadonlySet<string>;
  onSelect: (channel: Channel) => void;
  onOpenSettings: () => void;
  onOpenScreenShare: () => void;
  onSignOut: () => void;
}

export function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  user,
  voice,
  voiceOccupants,
  unreadChannelIds,
  onSelect,
  onOpenSettings,
  onOpenScreenShare,
  onSignOut,
}: ChannelSidebarProps) {
  const textChannels = channels.filter((channel) => channel.kind === "text");
  const voiceChannels = channels.filter((channel) => channel.kind === "voice");

  return (
    <aside className="channel-sidebar">
      <header className="server-switcher">
        <div>
          <strong>{server.name}</strong>
          <span>Private server</span>
        </div>
      </header>
      <nav className="channel-nav" aria-label="Channels">
        <ChannelGroup label="Conversations">
          {textChannels.map((channel) => (
            <button
              className={`channel-row ${selectedChannelId === channel.id ? "active" : ""} ${unreadChannelIds.has(channel.id) ? "channel-row--unread" : ""}`}
              type="button"
              key={channel.id}
              onClick={() => onSelect(channel)}
            >
              <Hash size={17} />
              <span>{channel.name}</span>
            </button>
          ))}
        </ChannelGroup>
        <ChannelGroup label="Voice rooms">
          {voiceChannels.map((channel) => (
            <div key={channel.id}>
              {(() => {
                const occupants = voiceOccupants.filter(
                  (occupant) => occupant.channelId === channel.id,
                );
                return (
                  <>
                    <button
                      className={`channel-row ${selectedChannelId === channel.id ? "active" : ""}`}
                      type="button"
                      onClick={() => onSelect(channel)}
                    >
                      <Volume2 size={17} />
                      <span>{channel.name}</span>
                      {occupants.length > 0 ? <i className="live-dot" /> : null}
                    </button>
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
                  </>
                );
              })()}
            </div>
          ))}
        </ChannelGroup>
      </nav>

      <div className="sidebar-spacer" />

      {voice.channel && voice.status !== "disconnected" ? (
        <div className="voice-dock">
          <div className="voice-dock__status">
            <i />
            <div>
              <strong>
                {voice.status === "connected"
                  ? "Voice connected"
                  : voice.status}
              </strong>
              <span>{voice.channel.name}</span>
            </div>
          </div>
          <div className="voice-dock__controls">
            {voice.screenShareAvailable || voice.screenShareEnabled ? (
              <button
                type="button"
                className={voice.screenShareEnabled ? "is-active" : ""}
                disabled={
                  voice.status !== "connected" || voice.screenSharePending
                }
                onClick={() =>
                  voice.screenShareEnabled
                    ? void voice.stopScreenShare()
                    : onOpenScreenShare()
                }
                aria-label={
                  voice.screenShareEnabled
                    ? "Stop screen sharing"
                    : "Share screen"
                }
              >
                <MonitorUp size={17} />
              </button>
            ) : null}
            <button
              type="button"
              disabled={voice.status !== "connected" || voice.cameraPending}
              onClick={() => void voice.toggleCamera()}
              aria-label={
                voice.cameraEnabled ? "Turn camera off" : "Turn camera on"
              }
            >
              {voice.cameraEnabled ? (
                <Video size={17} />
              ) : (
                <VideoOff size={17} />
              )}
            </button>
            <button
              type="button"
              disabled={voice.status !== "connected"}
              onClick={() => void voice.toggleMute()}
              aria-label={voice.muted ? "Unmute" : "Mute"}
            >
              {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button
              type="button"
              disabled={voice.status !== "connected"}
              onClick={() => void voice.toggleDeafen()}
              aria-label={voice.deafened ? "Undeafen" : "Deafen"}
            >
              {voice.deafened ? (
                <HeadphoneOff size={17} />
              ) : (
                <Headphones size={17} />
              )}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Voice settings"
            >
              <Settings size={17} />
            </button>
          </div>
        </div>
      ) : null}

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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="channel-group">
      <header>
        <span>{label}</span>
      </header>
      {children}
    </section>
  );
}
