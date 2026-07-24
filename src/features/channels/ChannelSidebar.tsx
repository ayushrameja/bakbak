import {
  ChevronDown,
  Hash,
  LockKeyhole,
  Megaphone,
  Pencil,
  Plus,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { OpenUserContextMenu } from "../../components/UserContextMenu";
import { APP_VERSION } from "../../lib/app-version";
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
import {
  loadCollapsedChannelGroups,
  saveCollapsedChannelGroups,
} from "./channel-group-preferences";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;
const UNCATEGORIZED_TEXT_GROUP_ID = "uncategorized:text";
const UNCATEGORIZED_VOICE_GROUP_ID = "uncategorized:voice";

interface ChannelGroupModel {
  id: string;
  label: string;
  channels: Channel[];
}

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
  onPrepareVoiceChannel: (channel: Channel, immediate?: boolean) => void;
  onCreateChannel: (kind: ChannelKind) => void;
  onRenameChannel: (channel: Channel) => void;
  onOpenSettings: () => void;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId?: string | null;
  onWatchStream?: (member: ServerMember, channel: Channel) => void;
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
  onOpenUserContextMenu,
  openProfileId = null,
  onWatchStream,
  onToggleSoundboard,
  onOpenScreenShare,
}: ChannelSidebarProps) {
  const channelGroups = useMemo<ChannelGroupModel[]>(() => {
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
    const groups = orderedCategories.map((category) => ({
      id: category.id,
      label: category.name,
      channels: channels
        .filter((channel) => channel.categoryId === category.id)
        .sort(compareChannels),
    }));

    if (uncategorizedTextChannels.length > 0) {
      groups.push({
        id: UNCATEGORIZED_TEXT_GROUP_ID,
        label: "Conversations",
        channels: uncategorizedTextChannels,
      });
    }
    if (uncategorizedVoiceChannels.length > 0) {
      groups.push({
        id: UNCATEGORIZED_VOICE_GROUP_ID,
        label: "Voice rooms",
        channels: uncategorizedVoiceChannels,
      });
    }
    return groups;
  }, [categories, channels]);
  const channelGroupIds = useMemo(
    () => channelGroups.map((group) => group.id),
    [channelGroups],
  );
  const [collapsedGroups, setCollapsedGroups] = useState(() =>
    loadCollapsedChannelGroups(server.id, channelGroupIds),
  );

  useEffect(() => {
    setCollapsedGroups(loadCollapsedChannelGroups(server.id, channelGroupIds));
  }, [channelGroupIds, server.id]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = {
        ...current,
        [groupId]: !current[groupId],
      };
      saveCollapsedChannelGroups(server.id, next);
      return next;
    });
  };

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
      const systemChannel =
        channel.purpose === "system-releases" ||
        channel.purpose === "system-general";
      return (
        <div className="channel-row-wrap" key={channel.id}>
          <button
            className={`channel-row ${selectedChannelId === channel.id ? "active" : ""} ${unreadChannelIds.has(channel.id) ? "channel-row--unread" : ""}`}
            type="button"
            onClick={() => onSelect(channel)}
          >
            {channel.purpose === "system-releases" ? (
              <Megaphone size={17} />
            ) : channel.purpose === "system-general" ? (
              <Sparkles size={17} />
            ) : (
              <Hash size={17} />
            )}
            <span>{channel.name}</span>
            {systemChannel ? (
              <LockKeyhole
                className="channel-row__readonly"
                size={12}
                aria-label="Automation-only channel"
              />
            ) : null}
          </button>
          {canManageChannels && !systemChannel ? (
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
            onFocus={() => onPrepareVoiceChannel(channel, true)}
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
                    onOpenContextMenu={onOpenUserContextMenu}
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
                    <span className="channel-voice-person__stream-actions">
                      <span className="channel-voice-person__live">LIVE</span>
                      {occupant.userId !== user.id && onWatchStream ? (
                        <button
                          className="channel-voice-person__watch"
                          type="button"
                          aria-label={`Watch ${occupant.displayName}'s stream`}
                          onClick={() =>
                            onWatchStream(profileForOccupant(occupant), channel)
                          }
                        >
                          Watch Stream
                        </button>
                      ) : null}
                    </span>
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
      <header
        className="server-switcher server-brand"
        aria-label={`${server.name} workspace brand`}
      >
        <div className="server-brand__wordmark">
          <strong>Bakbak</strong>
        </div>
        <div
          className="server-brand__release"
          aria-label={`Beta release, version ${APP_VERSION}`}
        >
          <span className="server-brand__release-symbol" aria-hidden="true">
            β
          </span>
          <span className="server-brand__release-dot" aria-hidden="true">
            {" · "}
          </span>
          <span className="server-brand__release-version">v{APP_VERSION}</span>
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
        {channelGroups.map((group) => {
          const collapsed = Boolean(collapsedGroups[group.id]);
          const containsSelected = group.channels.some(
            (channel) => channel.id === selectedChannelId,
          );
          const unreadCount = group.channels.filter(
            (channel) =>
              channel.kind === "text" && unreadChannelIds.has(channel.id),
          ).length;
          const groupChannelIds = new Set(
            group.channels.map((channel) => channel.id),
          );
          const voiceOccupantCount = voiceOccupants.filter((occupant) =>
            groupChannelIds.has(occupant.channelId),
          ).length;

          return (
            <ChannelGroup
              key={group.id}
              groupId={group.id}
              label={group.label}
              collapsed={collapsed}
              containsSelected={containsSelected}
              unreadCount={unreadCount}
              voiceOccupantCount={voiceOccupantCount}
              onToggle={() => toggleGroup(group.id)}
            >
              {group.channels.map(renderChannel)}
            </ChannelGroup>
          );
        })}
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
        onOpenUserContextMenu={onOpenUserContextMenu}
        openProfileId={openProfileId}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  );
}

function ChannelGroup({
  groupId,
  label,
  collapsed,
  containsSelected,
  unreadCount,
  voiceOccupantCount,
  onToggle,
  children,
}: {
  groupId: string;
  label: string;
  collapsed: boolean;
  containsSelected: boolean;
  unreadCount: number;
  voiceOccupantCount: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = `channel-group-${groupId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;

  return (
    <section
      className="channel-group"
      aria-label={label}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <header>
        <button
          className={`channel-group__toggle ${collapsed && containsSelected ? "is-selected" : ""}`}
          type="button"
          aria-expanded={!collapsed}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <ChevronDown
            className="channel-group__chevron"
            size={15}
            aria-hidden="true"
          />
          <span className="channel-group__label">{label}</span>
          {collapsed ? (
            <span className="channel-group__summary">
              {containsSelected ? (
                <span className="visually-hidden">
                  Selected channel inside.
                </span>
              ) : null}
              {unreadCount > 0 ? (
                <span
                  className="channel-group__unread-summary"
                  aria-label={`${unreadCount} unread ${
                    unreadCount === 1 ? "channel" : "channels"
                  }`}
                >
                  <i aria-hidden="true" />
                </span>
              ) : null}
              {voiceOccupantCount > 0 ? (
                <span
                  className="channel-group__voice-summary"
                  aria-label={`${voiceOccupantCount} ${
                    voiceOccupantCount === 1 ? "person" : "people"
                  } in voice`}
                >
                  <Volume2 size={12} aria-hidden="true" />
                  <b aria-hidden="true">{voiceOccupantCount}</b>
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      </header>
      <div className="channel-group__children" id={panelId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}

function compareChannels(left: Channel, right: Channel): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}
