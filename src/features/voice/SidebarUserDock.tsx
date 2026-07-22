import { HeadphoneOff, Headphones, Mic, MicOff, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import { COVER_BUCKET } from "../../lib/profile-service";
import type { ServerMember } from "../../lib/types";
import type { useVoiceRoom } from "./useVoiceRoom";

interface SidebarUserDockProps {
  member: ServerMember;
  voice: ReturnType<typeof useVoiceRoom>;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  openProfileId: string | null;
  onOpenSettings: () => void;
}

export function SidebarUserDock({
  member,
  voice,
  loadProfileMedia,
  onOpenProfile,
  openProfileId,
  onOpenSettings,
}: SidebarUserDockProps) {
  const callActive = voice.status !== "disconnected";
  const connected = voice.status === "connected";

  return (
    <div className="user-dock" role="group" aria-label="User controls">
      <SidebarUserCover member={member} loadProfileMedia={loadProfileMedia} />
      <ProfileTrigger
        className="user-dock__profile"
        member={member}
        loadMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
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
              <span>{connected ? "In voice" : "Available"}</span>
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

function SidebarUserCover({
  member,
  loadProfileMedia,
}: {
  member: ServerMember;
  loadProfileMedia: LoadProfileMedia;
}) {
  const [coverUrl, setCoverUrl] = useState(member.coverUrl);

  useEffect(() => {
    setCoverUrl(member.coverUrl);
    if (member.coverUrl || !member.coverPath) return;
    let current = true;
    void loadProfileMedia(COVER_BUCKET, member.coverPath)
      .then((url) => {
        if (current) setCoverUrl(url);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [loadProfileMedia, member.coverPath, member.coverUrl, member.id]);

  if (!coverUrl) return null;
  return (
    <span className="user-dock__cover" aria-hidden="true">
      <img
        src={coverUrl}
        alt=""
        loading="lazy"
        draggable={false}
        style={{
          objectPosition: `${member.coverPositionX}% ${member.coverPositionY}%`,
        }}
      />
    </span>
  );
}
