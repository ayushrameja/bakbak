import { Hash, Pencil, Plus, Volume2 } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type {
  AppUser,
  Channel,
  ChannelCategory,
  ChannelKind,
  DataMode,
  Server,
  ServerMember,
  VoiceRoomOccupant,
} from "../../lib/types";
import { VoiceElapsedTime } from "../voice/VoiceElapsedTime";
import { SidebarVoicePanel } from "../voice/SidebarVoicePanel";
import { SidebarUserDock } from "../voice/SidebarUserDock";
import type { useVoiceRoom } from "../voice/useVoiceRoom";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

interface ChannelSidebarProps {
  server: Server;
  categories: ChannelCategory[];
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
  categories,
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
  const orderedCategories = [...categories].sort(
    (left, right) =>
      left.position - right.position || left.id.localeCompare(right.id),
  );
  const knownCategoryIds = new Set(
    orderedCategories.map((category) => category.id),
  );
  const uncategorizedChannels = channels
    .filter(
      (channel) =>
        channel.categoryId === null ||
        !knownCategoryIds.has(channel.categoryId),
    )
    .sort(compareChannels);
  const uncategorizedTextChannels = uncategorizedChannels.filter(
    (channel) => channel.kind === "text",
  );
  const uncategorizedVoiceChannels = uncategorizedChannels.filter(
    (channel) => channel.kind === "voice",
  );
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
  const renderChannel = (channel: Channel) => {
    if (channel.kind === "text") {
      return (
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
      );
    }

    const occupants = voiceOccupants.filter(
      (occupant) => occupant.channelId === channel.id,
    );
    const roomJoinedAt = occupants.reduce<string | null>(
      (earliest, occupant) =>
        earliest === null ||
        Date.parse(occupant.joinedAt) < Date.parse(earliest)
          ? occupant.joinedAt
          : earliest,
      null,
    );
    const speakingUserIds =
      voice.channel?.id === channel.id
        ? new Set(
            voice.participants
              .filter((participant) => participant.isSpeaking)
              .map((participant) => participant.id),
          )
        : new Set<string>();
    return (
      <div className="channel-row-wrap" key={channel.id}>
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
            {roomJoinedAt ? (
              <span
                className="channel-voice-duration"
                aria-label={`${channel.name} active time`}
              >
                <i className="live-dot" />
                <VoiceElapsedTime joinedAt={roomJoinedAt} />
              </span>
            ) : null}
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
                <div className="channel-voice-person" key={occupant.userId}>
                  <ProfileTrigger
                    className="channel-voice-person__profile"
                    member={profileForOccupant(occupant)}
                    loadMedia={loadProfileMedia}
                    onOpenProfile={onOpenProfile}
                    expanded={openProfileId === occupant.userId}
                    aria-label={`View ${occupant.displayName}'s profile`}
                  >
                    {({ animationUrl, animated }) => (
                      <>
                        <span
                          className={`channel-voice-person__avatar ${speakingUserIds.has(occupant.userId) ? "is-speaking" : ""}`}
                        >
                          <Avatar
                            user={profileForOccupant(occupant)}
                            size="small"
                            animationUrl={animationUrl}
                            animated={animated}
                          />
                        </span>
                        <b>{occupant.displayName}</b>
                      </>
                    )}
                  </ProfileTrigger>
                  {occupant.isStreaming ? (
                    <span className="channel-voice-person__live">LIVE</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <aside className="channel-sidebar" id="context-panel">
      <header className="server-switcher server-brand">
        <img className="server-brand__mark" src="/bakbak-orbit.png" alt="" />
        <div className="server-brand__wordmark">
          <strong>{server.name}</strong>
        </div>
      </header>
      <nav className="channel-nav" aria-label="Channels">
        {canManageChannels ? (
          <div
            className="channel-create-actions"
            aria-label="Channel management"
          >
            <button
              type="button"
              aria-label="Create text channel"
              onClick={() => onCreateChannel("text")}
            >
              <Hash size={14} />
              <span>Text</span>
              <Plus size={13} />
            </button>
            <button
              type="button"
              aria-label="Create voice channel"
              onClick={() => onCreateChannel("voice")}
            >
              <Volume2 size={14} />
              <span>Voice</span>
              <Plus size={13} />
            </button>
          </div>
        ) : null}
        {orderedCategories.map((category) => (
          <ChannelGroup key={category.id} label={category.name}>
            {channels
              .filter((channel) => channel.categoryId === category.id)
              .sort(compareChannels)
              .map(renderChannel)}
          </ChannelGroup>
        ))}
        {uncategorizedTextChannels.length > 0 ? (
          <ChannelGroup label="Conversations">
            {uncategorizedTextChannels.map(renderChannel)}
          </ChannelGroup>
        ) : null}
        {uncategorizedVoiceChannels.length > 0 ? (
          <ChannelGroup label="Voice rooms">
            {uncategorizedVoiceChannels.map(renderChannel)}
          </ChannelGroup>
        ) : null}
      </nav>

      <div className="sidebar-spacer" />

      <SidebarVoicePanel
        voice={voice}
        mode={mode}
        soundboardOpen={soundboardOpen}
        onToggleSoundboard={onToggleSoundboard}
        onOpenScreenShare={onOpenScreenShare}
      />

      <SidebarUserDock
        member={currentMember}
        voice={voice}
        loadProfileMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
        openProfileId={openProfileId}
        onOpenSettings={onOpenSettings}
      />
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
    <section className="channel-group" aria-label={label}>
      <header>
        <h3>{label}</h3>
      </header>
      {children}
    </section>
  );
}

function compareChannels(left: Channel, right: Channel): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}
