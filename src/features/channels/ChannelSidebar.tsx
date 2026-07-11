import {
  ChevronDown,
  Hash,
  HeadphoneOff,
  Headphones,
  LogOut,
  Mic,
  MicOff,
  Plus,
  Settings,
  Volume2,
} from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type { AppUser, Channel, Server } from "../../lib/types";
import type { useVoiceRoom } from "../voice/useVoiceRoom";

interface ChannelSidebarProps {
  server: Server;
  channels: Channel[];
  selectedChannelId: string;
  user: AppUser;
  voice: ReturnType<typeof useVoiceRoom>;
  onSelect: (channel: Channel) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  user,
  voice,
  onSelect,
  onOpenSettings,
  onSignOut,
}: ChannelSidebarProps) {
  const textChannels = channels.filter((channel) => channel.kind === "text");
  const voiceChannels = channels.filter((channel) => channel.kind === "voice");

  return (
    <aside className="channel-sidebar">
      <button className="server-switcher" type="button">
        <div>
          <strong>{server.name}</strong>
          <span>Private server</span>
        </div>
        <ChevronDown size={17} />
      </button>
      <nav className="channel-nav" aria-label="Channels">
        <ChannelGroup label="Conversations">
          {textChannels.map((channel) => (
            <button
              className={`channel-row ${selectedChannelId === channel.id ? "active" : ""}`}
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
              <button
                className={`channel-row ${selectedChannelId === channel.id ? "active" : ""}`}
                type="button"
                onClick={() => onSelect(channel)}
              >
                <Volume2 size={17} />
                <span>{channel.name}</span>
                {voice.channel?.id === channel.id &&
                voice.status === "connected" ? (
                  <i className="live-dot" />
                ) : null}
              </button>
              {voice.channel?.id === channel.id &&
              voice.status === "connected" ? (
                <div className="channel-voice-people">
                  {voice.participants.map((participant) => (
                    <span key={participant.id}>
                      <i className={participant.isSpeaking ? "speaking" : ""} />
                      {participant.displayName}
                    </span>
                  ))}
                </div>
              ) : null}
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
            <button
              type="button"
              onClick={() => void voice.toggleMute()}
              aria-label={voice.muted ? "Unmute" : "Mute"}
            >
              {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button
              type="button"
              onClick={voice.toggleDeafen}
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
        <button type="button" aria-label={`Add to ${label}`}>
          <Plus size={14} />
        </button>
      </header>
      {children}
    </section>
  );
}
