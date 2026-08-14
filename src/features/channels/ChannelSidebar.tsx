import {
  ChevronDown,
  ChevronRight,
  Hash,
  Pencil,
  Plus,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import { SpaceSwitcher } from "../../components/SpaceSwitcher";
import type { OpenUserContextMenu } from "../../components/UserContextMenu";
import type {
  AppUser,
  Channel,
  ChannelCategory,
  ChannelKind,
  Server,
  ServerMember,
  VoiceRoomOccupant,
} from "../../lib/types";
import type { AppSpace } from "../server/app-space";
import type { SidebarPosition } from "../settings/layout-preferences";
import { MemberCoverPoster } from "../server/MemberPanel";
import { MembersOverlay } from "../server/MembersOverlay";
import { selectActivityPreview } from "../server/member-presence";
import type { MemberVoiceActivity } from "../server/MemberPanel";
import { VoiceElapsedTime } from "../voice/VoiceElapsedTime";
import { SidebarVoicePanel } from "../voice/SidebarVoicePanel";
import { SidebarUserDock } from "../voice/SidebarUserDock";
import type { useVoiceRoom } from "../voice/useVoiceRoom";
import { compareVoiceRoomOccupants } from "../voice/voice-occupancy";
import {
  loadActivityPreviewCollapsed,
  saveActivityPreviewCollapsed,
} from "./activity-preview-preference";

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
  memberVoiceActivities?: ReadonlyArray<MemberVoiceActivity>;
  unreadChannelIds: ReadonlySet<string>;
  voice: ReturnType<typeof useVoiceRoom>;
  canManageChannels: boolean;
  activeSpace?: AppSpace;
  personalUnread?: boolean;
  serverUnread?: boolean;
  serverAvailable?: boolean;
  switchDisabled?: boolean;
  onSelectSpace?: (space: AppSpace) => void;
  onSelect: (channel: Channel) => void;
  onPrepareVoiceChannel: (channel: Channel, immediate?: boolean) => void;
  onCreateChannel: (kind: ChannelKind) => void;
  onRenameChannel: (channel: Channel) => void;
  onOpenSettings: () => void;
  sidebarPosition: SidebarPosition;
  sidebarToggleDisabled: boolean;
  onHideSidebar: () => void;
  soundboardOpen: boolean;
  onToggleSoundboard: () => void;
  onOpenScreenShare: () => void;
  membersOpen?: boolean;
  onMembersOpenChange?: (open: boolean) => void;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId?: string | null;
  onMessageMember?: (member: ServerMember) => void;
  onWatchStream?: (member: ServerMember, channel: Channel) => void;
}

export function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  user,
  members = [],
  voiceOccupants,
  memberVoiceActivities = [],
  unreadChannelIds,
  voice,
  canManageChannels,
  activeSpace = "server",
  personalUnread = false,
  serverUnread = unreadChannelIds.size > 0,
  serverAvailable = true,
  switchDisabled = false,
  onSelectSpace = () => undefined,
  onSelect,
  onPrepareVoiceChannel,
  onCreateChannel,
  onRenameChannel,
  onOpenSettings,
  sidebarPosition,
  sidebarToggleDisabled,
  onHideSidebar,
  soundboardOpen,
  onToggleSoundboard,
  onOpenScreenShare,
  membersOpen,
  onMembersOpenChange,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  onOpenUserContextMenu,
  openProfileId = null,
  onMessageMember = () => undefined,
  onWatchStream,
}: ChannelSidebarProps) {
  const [localMembersOpen, setLocalMembersOpen] = useState(false);
  const [activityCollapsed, setActivityCollapsed] = useState(() =>
    loadActivityPreviewCollapsed(user.id, server.id),
  );
  const [channelCreateMenuOpen, setChannelCreateMenuOpen] = useState(false);
  const channelCreateMenuRef = useRef<HTMLDivElement>(null);
  const channelCreateButtonRef = useRef<HTMLButtonElement>(null);
  const membersDialogOpen = membersOpen ?? localMembersOpen;
  const setMembersOpen = (open: boolean) => {
    if (onMembersOpenChange) onMembersOpenChange(open);
    else setLocalMembersOpen(open);
  };

  useEffect(() => {
    setActivityCollapsed(loadActivityPreviewCollapsed(user.id, server.id));
  }, [server.id, user.id]);

  useEffect(() => {
    if (!channelCreateMenuOpen) return;
    channelCreateMenuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const closeMenu = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        event.preventDefault();
        setChannelCreateMenuOpen(false);
        channelCreateButtonRef.current?.focus();
        return;
      }
      if (
        event instanceof MouseEvent &&
        event.target instanceof Node &&
        !channelCreateMenuRef.current?.contains(event.target)
      ) {
        setChannelCreateMenuOpen(false);
      }
    };
    document.addEventListener("keydown", closeMenu);
    document.addEventListener("mousedown", closeMenu);
    return () => {
      document.removeEventListener("keydown", closeMenu);
      document.removeEventListener("mousedown", closeMenu);
    };
  }, [channelCreateMenuOpen]);

  const chooseChannelKind = (kind: ChannelKind) => {
    setChannelCreateMenuOpen(false);
    onCreateChannel(kind);
  };
  const toggleActivityPreview = () => {
    const nextCollapsed = !activityCollapsed;
    setActivityCollapsed(nextCollapsed);
    saveActivityPreviewCollapsed(user.id, server.id, nextCollapsed);
  };
  const orderedChannels = useMemo(
    () => [...channels].sort(compareChannels),
    [channels],
  );
  const previewMembers = useMemo(
    () => selectActivityPreview(members, memberVoiceActivities, user.id),
    [memberVoiceActivities, members, user.id],
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
      avatarGiphyId: null,
      coverUrl: null,
      coverAnimationUrl: null,
      coverPath: null,
      coverAnimationPath: null,
      coverGiphyId: null,
      coverPositionX: 50,
      coverPositionY: 50,
      description: "",
      status: "online",
      role: "member",
    };

  return (
    <aside className="channel-sidebar unified-sidebar" id="context-panel">
      <SpaceSwitcher
        activeSpace={activeSpace}
        personalUnread={personalUnread}
        serverUnread={serverUnread}
        callActive={voice.status !== "disconnected"}
        serverAvailable={serverAvailable}
        disabled={switchDisabled}
        onSelect={onSelectSpace}
      />

      <section
        className="activity-preview"
        aria-labelledby="activity-preview-title"
        data-collapsed={activityCollapsed}
      >
        <header>
          <button
            className="activity-preview__toggle"
            type="button"
            aria-label={`${activityCollapsed ? "Expand" : "Collapse"} Activity`}
            aria-expanded={!activityCollapsed}
            aria-controls="activity-preview-content"
            onClick={toggleActivityPreview}
          >
            <span id="activity-preview-title">Activity</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </header>
        <div id="activity-preview-content" hidden={activityCollapsed}>
          {previewMembers.length === 0 ? (
            <p className="activity-preview__empty">
              Nobody else is here. A suspicious amount of productivity.
            </p>
          ) : null}
          <div className="activity-preview__people">
            {previewMembers.map((member) => (
              <ProfileTrigger
                key={member.id}
                className="activity-preview__person"
                data-status={member.status}
                member={member}
                loadMedia={loadProfileMedia}
                onOpenProfile={onOpenProfile}
                onOpenContextMenu={onOpenUserContextMenu}
                expanded={openProfileId === member.id}
                autoPlayAnimation
                aria-label={`View ${member.displayName}'s profile`}
              >
                {({ animationUrl, animated, engaged }) => (
                  <>
                    <MemberCoverPoster
                      className="activity-preview__cover"
                      rootSelector=".unified-sidebar"
                      member={member}
                      loadProfileMedia={loadProfileMedia}
                      engaged={engaged}
                      autoPlayAnimation
                    />
                    <Avatar
                      user={member}
                      size="small"
                      showStatus
                      animationUrl={animationUrl}
                      animated={animated}
                    />
                    <span>{member.displayName}</span>
                  </>
                )}
              </ProfileTrigger>
            ))}
            <button
              className="activity-preview__show-all"
              type="button"
              onClick={() => setMembersOpen(true)}
            >
              <span>Show all</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <nav className="channel-nav" aria-label="Channels">
        <header className="channel-nav__header">
          <span>Channels</span>
          {canManageChannels ? (
            <div className="channel-nav__actions">
              <div ref={channelCreateMenuRef} className="channel-create-menu">
                <button
                  ref={channelCreateButtonRef}
                  type="button"
                  aria-label="Add channel"
                  aria-haspopup="menu"
                  aria-expanded={channelCreateMenuOpen}
                  aria-controls="channel-create-menu"
                  onClick={() => setChannelCreateMenuOpen((open) => !open)}
                >
                  <Plus size={15} />
                </button>
                {channelCreateMenuOpen ? (
                  <div
                    id="channel-create-menu"
                    className="channel-create-menu__popover"
                    role="menu"
                    aria-label="Add channel"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => chooseChannelKind("text")}
                    >
                      <Hash size={14} aria-hidden="true" />
                      <span>Text channel</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => chooseChannelKind("voice")}
                    >
                      <Volume2 size={14} aria-hidden="true" />
                      <span>Voice channel</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </header>
        <div className="channel-list">
          {orderedChannels.map((channel) => {
            const occupants = voiceOccupants
              .filter((occupant) => occupant.channelId === channel.id)
              .sort(compareVoiceRoomOccupants);
            const roomJoinedAt = occupants.reduce<string | null>(
              (earliest, occupant) =>
                occupant.joinedAt &&
                (!earliest ||
                  Date.parse(occupant.joinedAt) < Date.parse(earliest))
                  ? occupant.joinedAt
                  : earliest,
              null,
            );
            const isWelcome = channel.purpose === "system-general";
            return (
              <div className="channel-row-wrap" key={channel.id}>
                <div className="channel-row-stack">
                  <button
                    className={`channel-row ${selectedChannelId === channel.id ? "active" : ""} ${channel.kind === "text" && unreadChannelIds.has(channel.id) ? "channel-row--unread" : ""}`}
                    type="button"
                    aria-current={
                      selectedChannelId === channel.id ? "page" : undefined
                    }
                    onPointerEnter={() =>
                      channel.kind === "voice"
                        ? onPrepareVoiceChannel(channel)
                        : undefined
                    }
                    onFocus={() =>
                      channel.kind === "voice"
                        ? onPrepareVoiceChannel(channel, true)
                        : undefined
                    }
                    onClick={() => onSelect(channel)}
                  >
                    {isWelcome ? (
                      <Sparkles size={16} />
                    ) : channel.kind === "voice" ? (
                      <Volume2 size={16} />
                    ) : (
                      <Hash size={16} />
                    )}
                    <span>{channel.name}</span>
                    {roomJoinedAt ? (
                      <span className="channel-voice-duration">
                        <i className="live-dot" />
                        <VoiceElapsedTime joinedAt={roomJoinedAt} />
                      </span>
                    ) : null}
                  </button>
                  {canManageChannels && !isWelcome ? (
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
                      {occupants.map((occupant) => {
                        const member = profileForOccupant(occupant);
                        return (
                          <div
                            className="channel-voice-person"
                            key={occupant.userId}
                          >
                            <ProfileTrigger
                              className="channel-voice-person__profile"
                              member={member}
                              loadMedia={loadProfileMedia}
                              onOpenProfile={onOpenProfile}
                              onOpenContextMenu={onOpenUserContextMenu}
                              expanded={openProfileId === occupant.userId}
                              aria-label={`View ${occupant.displayName}'s profile`}
                            >
                              {({ animationUrl, animated }) => (
                                <>
                                  <Avatar
                                    user={member}
                                    size="small"
                                    animationUrl={animationUrl}
                                    animated={animated}
                                  />
                                  <b>{occupant.displayName}</b>
                                </>
                              )}
                            </ProfileTrigger>
                            {occupant.isStreaming ? (
                              <span className="channel-voice-person__stream-actions">
                                <span className="channel-voice-person__live">
                                  LIVE
                                </span>
                                {occupant.userId !== user.id &&
                                onWatchStream ? (
                                  <button
                                    className="channel-voice-person__watch"
                                    type="button"
                                    onClick={() =>
                                      onWatchStream(member, channel)
                                    }
                                  >
                                    Watch Stream
                                  </button>
                                ) : null}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="sidebar-spacer" />
      <SidebarVoicePanel
        voice={voice}
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
        sidebarPosition={sidebarPosition}
        sidebarToggleDisabled={sidebarToggleDisabled}
        onHideSidebar={onHideSidebar}
      />

      {membersDialogOpen ? (
        <MembersOverlay
          members={members}
          voiceActivities={memberVoiceActivities}
          currentUserId={user.id}
          loadProfileMedia={loadProfileMedia}
          onOpenProfile={onOpenProfile}
          onOpenUserContextMenu={onOpenUserContextMenu}
          openProfileId={openProfileId}
          onMessage={onMessageMember}
          onWatchStream={(member, channelId) => {
            const channel = channels.find(
              (candidate) => candidate.id === channelId,
            );
            if (channel) onWatchStream?.(member, channel);
          }}
          onClose={() => setMembersOpen(false)}
        />
      ) : null}
    </aside>
  );
}

function compareChannels(left: Channel, right: Channel): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}
