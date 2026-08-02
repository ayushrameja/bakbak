import { Crown, MessageCircle, MonitorUp, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { ProfileMediaImage } from "../../components/ProfileMediaImage";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { OpenUserContextMenu } from "../../components/UserContextMenu";
import { COVER_BUCKET } from "../../lib/profile-service";
import { resolveGiphyProfileMedia } from "../../lib/profile-giphy-media";
import type { ServerMember } from "../../lib/types";
import { useReducedMotion } from "../../lib/use-reduced-motion";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

export interface MemberVoiceActivity {
  userId: string;
  channelId: string;
  channelName: string;
  isStreaming: boolean;
}

interface MemberPanelProps {
  members: ServerMember[];
  voiceActivities?: ReadonlyArray<MemberVoiceActivity>;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId?: string | null;
  currentUserId?: string;
  onWatchStream?:
    ((member: ServerMember, channelId: string) => void) | undefined;
  onMessage?: ((member: ServerMember) => void) | undefined;
}

interface MemberWithActivity {
  member: ServerMember;
  activity: MemberVoiceActivity | null;
}

export function MemberPanel({
  members,
  voiceActivities = [],
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  onOpenUserContextMenu,
  openProfileId = null,
  currentUserId = "",
  onWatchStream,
  onMessage,
}: MemberPanelProps) {
  const activityByMemberId = new Map(
    voiceActivities.map((activity) => [activity.userId, activity]),
  );
  const inVoice = members
    .flatMap((member) => {
      const activity = activityByMemberId.get(member.id);
      return activity ? [{ member, activity }] : [];
    })
    .sort(compareInVoiceMembers);
  const online = members
    .filter(
      (member) =>
        member.status === "online" && !activityByMemberId.has(member.id),
    )
    .sort(compareMembers)
    .map((member) => ({ member, activity: null }));
  const away = members
    .filter(
      (member) =>
        member.status === "idle" && !activityByMemberId.has(member.id),
    )
    .sort(compareMembers)
    .map((member) => ({ member, activity: null }));
  const offline = members
    .filter(
      (member) =>
        member.status === "offline" && !activityByMemberId.has(member.id),
    )
    .sort(compareMembers)
    .map((member) => ({ member, activity: null }));
  const groups = [
    { label: "In Voice", entries: inVoice },
    { label: "Online", entries: online },
    { label: "Away", entries: away },
    { label: "Offline", entries: offline },
  ].filter((group) => group.entries.length > 0);

  return (
    <aside className="member-panel" id="member-panel" aria-label="Members">
      {groups.length === 0 ? (
        <p className="member-panel__empty member-panel__empty--all">
          Nobody here right now.
        </p>
      ) : (
        groups.map((group) => (
          <MemberGroup
            key={group.label}
            label={group.label}
            entries={group.entries}
            loadProfileMedia={loadProfileMedia}
            onOpenProfile={onOpenProfile}
            onOpenUserContextMenu={onOpenUserContextMenu}
            openProfileId={openProfileId}
            currentUserId={currentUserId}
            onWatchStream={onWatchStream}
            onMessage={onMessage}
          />
        ))
      )}
    </aside>
  );
}

function MemberGroup({
  label,
  entries,
  loadProfileMedia,
  onOpenProfile,
  onOpenUserContextMenu,
  openProfileId,
  currentUserId,
  onWatchStream,
  onMessage,
}: {
  label: string;
  entries: MemberWithActivity[];
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId: string | null;
  currentUserId: string;
  onWatchStream?:
    ((member: ServerMember, channelId: string) => void) | undefined;
  onMessage?: ((member: ServerMember) => void) | undefined;
}) {
  return (
    <section className="member-panel__group" aria-label={label}>
      <h2>
        {label} <span>— {entries.length}</span>
      </h2>
      {entries.map(({ member, activity }) => (
        <div className="member-panel__person-row" key={member.id}>
          <ProfileTrigger
            className={`member-panel__person ${member.status === "offline" ? "is-offline" : ""} ${activity ? "is-in-voice" : ""}`}
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
                <span className="member-panel__identity">
                  <strong>
                    {member.displayName}
                    {member.id === currentUserId ? " (You)" : ""}
                  </strong>
                  <span
                    className={`member-panel__presence ${activity?.isStreaming ? "is-streaming" : activity ? "is-in-voice" : ""}`}
                  >
                    {activity ? (
                      <>
                        {activity.isStreaming ? (
                          <MonitorUp size={12} aria-hidden="true" />
                        ) : (
                          <Volume2 size={12} aria-hidden="true" />
                        )}
                        {activity.isStreaming ? "Streaming in" : "In"}{" "}
                        {activity.channelName}
                      </>
                    ) : member.status === "online" ? (
                      "Online"
                    ) : member.status === "idle" ? (
                      "Away"
                    ) : (
                      "Offline"
                    )}
                  </span>
                </span>
                {member.role === "admin" ? (
                  <Crown
                    className="member-panel__admin"
                    size={14}
                    aria-label="Admin"
                  />
                ) : null}
              </>
            )}
          </ProfileTrigger>
          {activity?.isStreaming &&
          member.id !== currentUserId &&
          onWatchStream ? (
            <button
              className="member-panel__watch"
              type="button"
              aria-label={`Watch ${member.displayName}'s stream`}
              onClick={() => onWatchStream(member, activity.channelId)}
            >
              Watch Stream
            </button>
          ) : null}
          {member.id !== currentUserId && onMessage ? (
            <button
              className="member-panel__message"
              type="button"
              aria-label={`Message ${member.displayName}`}
              onClick={() => onMessage(member)}
            >
              <MessageCircle size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export function MemberCoverPoster({
  member,
  loadProfileMedia,
  engaged,
  autoPlayAnimation = false,
  className = "member-panel__cover",
  rootSelector = ".member-panel",
}: {
  member: ServerMember;
  loadProfileMedia: LoadProfileMedia;
  engaged: boolean;
  autoPlayAnimation?: boolean;
  className?: string;
  rootSelector?: string;
}) {
  const reducedMotion = useReducedMotion();
  const markerRef = useRef<HTMLSpanElement>(null);
  const [requested, setRequested] = useState(Boolean(member.coverUrl));
  const [coverUrl, setCoverUrl] = useState(member.coverUrl);
  const [animationRequested, setAnimationRequested] = useState(
    Boolean(member.coverAnimationUrl),
  );
  const [coverAnimationUrl, setCoverAnimationUrl] = useState(
    member.coverAnimationUrl,
  );

  useEffect(() => {
    setRequested(Boolean(member.coverUrl));
    setCoverUrl(member.coverUrl);
    setAnimationRequested(Boolean(member.coverAnimationUrl));
    setCoverAnimationUrl(member.coverAnimationUrl);
  }, [
    member.coverAnimationPath,
    member.coverAnimationUrl,
    member.coverGiphyId,
    member.coverPath,
    member.coverUrl,
    member.id,
  ]);

  useEffect(() => {
    if (
      requested ||
      member.coverUrl ||
      (!member.coverPath && !member.coverGiphyId)
    )
      return;
    if (member.coverGiphyId) {
      if (engaged || autoPlayAnimation) setRequested(true);
      return;
    }
    const marker = markerRef.current;
    if (!marker || typeof IntersectionObserver !== "function") {
      setRequested(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setRequested(true);
        observer.disconnect();
      },
      { root: marker.closest(rootSelector), rootMargin: "64px" },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [
    autoPlayAnimation,
    engaged,
    member.coverGiphyId,
    member.coverPath,
    member.coverUrl,
    requested,
    rootSelector,
  ]);

  useEffect(() => {
    if (!reducedMotion && (engaged || autoPlayAnimation)) {
      setAnimationRequested(true);
    }
  }, [autoPlayAnimation, engaged, reducedMotion]);

  useEffect(() => {
    const shouldLoadPoster =
      requested &&
      !coverUrl &&
      !member.coverUrl &&
      Boolean(member.coverPath || member.coverGiphyId);
    const shouldLoadAnimation =
      animationRequested &&
      !reducedMotion &&
      !coverAnimationUrl &&
      !member.coverAnimationUrl &&
      Boolean(member.coverAnimationPath || member.coverGiphyId);
    if (!shouldLoadPoster && !shouldLoadAnimation) return;

    let current = true;
    const media = member.coverGiphyId
      ? resolveGiphyProfileMedia(
          {
            avatarGiphyId: member.avatarGiphyId,
            coverGiphyId: member.coverGiphyId,
          },
          {
            includeCover: true,
            includeCoverAnimation: shouldLoadAnimation,
          },
        ).then((resolved) => ({
          posterUrl: resolved.coverPosterUrl,
          animationUrl: resolved.coverAnimationUrl,
        }))
      : Promise.all([
          shouldLoadPoster
            ? loadProfileMedia(COVER_BUCKET, member.coverPath)
            : Promise.resolve(coverUrl),
          shouldLoadAnimation
            ? loadProfileMedia(COVER_BUCKET, member.coverAnimationPath)
            : Promise.resolve(coverAnimationUrl),
        ]).then(([posterUrl, animationUrl]) => ({ posterUrl, animationUrl }));
    void media
      .then(({ posterUrl, animationUrl }) => {
        if (!current) return;
        if (shouldLoadPoster) setCoverUrl(posterUrl);
        if (shouldLoadAnimation) setCoverAnimationUrl(animationUrl);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [
    animationRequested,
    autoPlayAnimation,
    coverAnimationUrl,
    coverUrl,
    engaged,
    loadProfileMedia,
    member.avatarGiphyId,
    member.coverAnimationPath,
    member.coverAnimationUrl,
    member.coverGiphyId,
    member.coverPath,
    member.coverUrl,
    reducedMotion,
    requested,
  ]);

  return (
    <span
      ref={markerRef}
      className={`${className} ${coverUrl || (!reducedMotion && coverAnimationUrl) ? "has-media" : ""}`}
      aria-hidden="true"
    >
      {coverUrl ? (
        <ProfileMediaImage
          className="member-cover-poster__poster"
          bucket={COVER_BUCKET}
          loadMedia={loadProfileMedia}
          path={member.coverPath}
          src={coverUrl}
          alt=""
          loading="lazy"
          draggable={false}
          style={{
            objectPosition: `${member.coverPositionX}% ${member.coverPositionY}%`,
          }}
        />
      ) : null}
      {!reducedMotion && coverAnimationUrl ? (
        <ProfileMediaImage
          className="member-cover-poster__animation"
          bucket={COVER_BUCKET}
          loadMedia={loadProfileMedia}
          path={member.coverAnimationPath}
          src={coverAnimationUrl}
          alt=""
          draggable={false}
          style={{
            objectPosition: `${member.coverPositionX}% ${member.coverPositionY}%`,
          }}
        />
      ) : null}
    </span>
  );
}

function compareMembers(left: ServerMember, right: ServerMember): number {
  const roleOrder =
    Number(right.role === "admin") - Number(left.role === "admin");
  return (
    roleOrder ||
    left.displayName.localeCompare(right.displayName, undefined, {
      sensitivity: "base",
    })
  );
}

function compareInVoiceMembers(
  left: MemberWithActivity,
  right: MemberWithActivity,
): number {
  const streamingOrder =
    Number(Boolean(right.activity?.isStreaming)) -
    Number(Boolean(left.activity?.isStreaming));
  return streamingOrder || compareMembers(left.member, right.member);
}
