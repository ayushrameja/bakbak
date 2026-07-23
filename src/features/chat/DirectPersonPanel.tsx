import { Crown, MessageCircle, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { ProfileMediaImage } from "../../components/ProfileMediaImage";
import type { LoadProfileMedia } from "../../components/ProfileTrigger";
import { AVATAR_BUCKET, COVER_BUCKET } from "../../lib/profile-service";
import type { ServerMember } from "../../lib/types";
import { useReducedMotion } from "../../lib/use-reduced-motion";

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
  const [coverAnimationUrl, setCoverAnimationUrl] = useState<string | null>(
    null,
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarAnimationUrl, setAvatarAnimationUrl] = useState<string | null>(
    null,
  );
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    if (!member) {
      setCoverUrl(null);
      setCoverAnimationUrl(null);
      setAvatarUrl(null);
      setAvatarAnimationUrl(null);
      return;
    }
    void Promise.all([
      member.coverUrl
        ? Promise.resolve(member.coverUrl)
        : loadProfileMedia(COVER_BUCKET, member.coverPath),
      member.avatarUrl
        ? Promise.resolve(member.avatarUrl)
        : loadProfileMedia(AVATAR_BUCKET, member.avatarPath),
      reducedMotion
        ? Promise.resolve(null)
        : member.coverAnimationUrl
          ? Promise.resolve(member.coverAnimationUrl)
          : loadProfileMedia(COVER_BUCKET, member.coverAnimationPath),
      reducedMotion
        ? Promise.resolve(null)
        : member.avatarAnimationUrl
          ? Promise.resolve(member.avatarAnimationUrl)
          : loadProfileMedia(AVATAR_BUCKET, member.avatarAnimationPath),
    ]).then(([cover, avatar, animatedCover, animatedAvatar]) => {
      if (!cancelled) {
        setCoverUrl(cover);
        setCoverAnimationUrl(animatedCover);
        setAvatarUrl(avatar);
        setAvatarAnimationUrl(animatedAvatar);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadProfileMedia, member, reducedMotion]);

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
      <div className="direct-person-panel__cover">
        {coverUrl ? (
          <ProfileMediaImage
            bucket={COVER_BUCKET}
            className="direct-person-panel__cover-poster"
            loadMedia={loadProfileMedia}
            path={member.coverPath}
            src={coverUrl}
            alt=""
            style={{
              objectPosition: `${member.coverPositionX}% ${member.coverPositionY}%`,
            }}
          />
        ) : null}
        {coverAnimationUrl ? (
          <ProfileMediaImage
            bucket={COVER_BUCKET}
            className="direct-person-panel__cover-animation"
            loadMedia={loadProfileMedia}
            path={member.coverAnimationPath}
            src={coverAnimationUrl}
            alt=""
            style={{
              objectPosition: `${member.coverPositionX}% ${member.coverPositionY}%`,
            }}
          />
        ) : null}
      </div>
      <div className="direct-person-panel__identity">
        <Avatar
          user={displayedMember}
          size="large"
          showStatus
          animationUrl={avatarAnimationUrl}
          animated={!reducedMotion}
        />
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
