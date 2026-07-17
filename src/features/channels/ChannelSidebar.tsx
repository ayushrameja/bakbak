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
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type {
  AppUser,
  Channel,
  ChannelKind,
  DataMode,
  Server,
  ServerMember,
  VoiceRoomOccupant,
} from "../../lib/types";
import { VoiceElapsedTime } from "../voice/VoiceElapsedTime";
import { SidebarVoicePanel } from "../voice/SidebarVoicePanel";
import type { useVoiceRoom } from "../voice/useVoiceRoom";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

interface ChannelSidebarProps {
  server: Server;
  channels: Channel[];
  selectedChannelId: string;
  user: AppUser;
  members?: ServerMember[];
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
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  openProfileId?: string | null;
  onToggleSoundboard: () => void;
  onOpenScreenShare: () => void;
}

export function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  user,
  members = [],
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
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  openProfileId = null,
  onToggleSoundboard,
  onOpenScreenShare,
}: ChannelSidebarProps) {
  const textChannels = channels.filter((channel) => channel.kind === "text");
  const voiceChannels = channels.filter((channel) => channel.kind === "voice");
  const membersById = new Map(members.map((member) => [member.id, member]));
  const currentMember = membersById.get(user.id) ?? { ...user, role: "member" };
  const profileForOccupant = (occupant: VoiceRoomOccupant): ServerMember =>
    membersById.get(occupant.userId) ?? {
      id: occupant.userId,
      displayName: occupant.displayName,
      email: "",
      avatarUrl: occupant.avatarUrl,
      avatarAnimationUrl: null,
      avatarPath: null,
      avatarAnimationPath: null,
      coverUrl: null,
      coverAnimationUrl: null,
      coverPath: null,
      coverAnimationPath: null,
      coverPositionX: 50,
      coverPositionY: 50,
      description: "",
      status: "online",
      role: "member",
    };

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
                          <ProfileTrigger
                            className="channel-voice-person"
                            key={occupant.userId}
                            member={profileForOccupant(occupant)}
                            loadMedia={loadProfileMedia}
                            onOpenProfile={onOpenProfile}
                            expanded={openProfileId === occupant.userId}
                            aria-label={`View ${occupant.displayName}'s profile`}
                          >
                            {() => (
                              <>
                                <i />
                                <b>
                                  {occupant.displayName}
                                  {occupant.userId === user.id ? " (you)" : ""}
                                </b>
                                <VoiceElapsedTime
                                  joinedAt={occupant.joinedAt}
                                />
                              </>
                            )}
                          </ProfileTrigger>
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
        <ProfileTrigger
          className="user-dock__profile"
          member={currentMember}
          loadMedia={loadProfileMedia}
          onOpenProfile={onOpenProfile}
          expanded={openProfileId === currentMember.id}
          aria-label={`View ${user.displayName}'s profile`}
        >
          {({ animationUrl, animated }) => (
            <>
              <Avatar
                user={user}
                size="small"
                showStatus
                animationUrl={animationUrl}
                animated={animated}
              />
              <span className="user-dock__identity">
                <strong>{user.displayName}</strong>
                <span>
                  {voice.status === "connected" ? "In voice" : "Available"}
                </span>
              </span>
            </>
          )}
        </ProfileTrigger>
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
