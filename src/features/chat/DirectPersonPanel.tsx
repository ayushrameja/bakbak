import { Crown, MessageCircle, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "../../components/Avatar";
import type { LoadProfileMedia } from "../../components/ProfileTrigger";
import { AVATAR_BUCKET, COVER_BUCKET } from "../../lib/profile-service";
import type { ServerMember } from "../../lib/types";

interface DirectPersonPanelProps {
  member: ServerMember | null;
  loadProfileMedia: LoadProfileMedia;
  sharesServer: boolean;
}

export function DirectPersonPanel({
  member,
  loadProfileMedia,
  sharesServer,
}: DirectPersonPanelProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!member) {
      setCoverUrl(null);
      setAvatarUrl(null);
      return;
    }
    void Promise.all([
      member.coverUrl
        ? Promise.resolve(member.coverUrl)
        : loadProfileMedia(COVER_BUCKET, member.coverPath),
      member.avatarUrl
        ? Promise.resolve(member.avatarUrl)
        : loadProfileMedia(AVATAR_BUCKET, member.avatarPath),
    ]).then(([cover, avatar]) => {
      if (!cancelled) {
        setCoverUrl(cover);
        setAvatarUrl(avatar);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadProfileMedia, member]);

  if (!member) {
    return (
      <aside className="member-panel direct-person-panel" id="member-panel">
        <div className="direct-person-panel__empty">
          <MessageCircle size={26} />
          <strong>Choose a conversation</strong>
          <span>The other person’s club card will appear here.</span>
        </div>
      </aside>
    );
  }

  const displayedMember = avatarUrl ? { ...member, avatarUrl } : member;
  return (
    <aside
      className="member-panel direct-person-panel"
      id="member-panel"
      aria-label={`${member.displayName} details`}
    >
      <div
        className="direct-person-panel__cover"
        style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined}
      />
      <div className="direct-person-panel__identity">
        <Avatar user={displayedMember} size="large" showStatus />
        <h2>{member.displayName}</h2>
        <span>
          {member.status === "online"
            ? "Online"
            : member.status === "idle"
              ? "Away"
              : "Offline"}
        </span>
      </div>
      <div className="direct-person-panel__details">
        <p>
          {member.description ||
            "A private-club member of admirable mystery and questionable timing."}
        </p>
        <span>
          <UsersRound size={15} />
          {sharesServer ? "Bakbak member" : "Direct-message contact"}
        </span>
        {member.role === "admin" ? (
          <span>
            <Crown size={15} /> Club admin
          </span>
        ) : null}
      </div>
    </aside>
  );
}
