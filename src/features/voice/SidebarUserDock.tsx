import { HeadphoneOff, Headphones, Mic, MicOff, Settings } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { OpenUserContextMenu } from "../../components/UserContextMenu";
import type { ServerMember } from "../../lib/types";
import type { useVoiceRoom } from "./useVoiceRoom";

interface SidebarUserDockProps {
  member: ServerMember;
  voice: ReturnType<typeof useVoiceRoom>;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId: string | null;
  onOpenSettings: () => void;
}

export function SidebarUserDock({
  member,
  voice,
  loadProfileMedia,
  onOpenProfile,
  onOpenUserContextMenu,
  openProfileId,
  onOpenSettings,
}: SidebarUserDockProps) {
  const callActive = voice.status !== "disconnected";
  const connected = voice.status === "connected";
  const statusLabel = connected
    ? "In voice"
    : member.status === "online"
      ? "Online"
      : member.status === "idle"
        ? "Away"
        : "Offline";

  return (
    <div
      className="user-dock"
      data-call-active={callActive ? "true" : "false"}
      data-status={member.status}
      role="group"
      aria-label="User controls"
    >
      <ProfileTrigger
        className="user-dock__profile"
        member={member}
        loadMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
        onOpenContextMenu={onOpenUserContextMenu}
        expanded={openProfileId === member.id}
        aria-label={`View ${member.displayName}'s profile`}
      >
        {({ animationUrl, animated }) => (
          <>
            <Avatar
              user={member}
              size="small"
              showStatus
              animationUrl={animationUrl}
              animated={animated}
            />
            <span className="user-dock__identity">
              <strong>{member.displayName}</strong>
              <span className="user-dock__status">{statusLabel}</span>
            </span>
          </>
        )}
      </ProfileTrigger>
      {callActive ? (
        <>
          <button
            className={`user-dock__control ${voice.muted ? "is-danger" : ""}`}
            type="button"
            disabled={!connected}
            onClick={() => void voice.toggleMute()}
            aria-label={voice.muted ? "Unmute" : "Mute"}
            aria-pressed={voice.muted}
          >
            {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button
            className={`user-dock__control ${voice.deafened ? "is-danger" : ""}`}
            type="button"
            disabled={!connected}
            onClick={() => void voice.toggleDeafen()}
            aria-label={voice.deafened ? "Undeafen" : "Deafen"}
            aria-pressed={voice.deafened}
          >
            {voice.deafened ? (
              <HeadphoneOff size={17} />
            ) : (
              <Headphones size={17} />
            )}
          </button>
        </>
      ) : null}
      <button
        className="user-dock__control"
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
      >
        <Settings size={17} />
      </button>
    </div>
  );
}
