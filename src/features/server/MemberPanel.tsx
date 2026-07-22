import { Crown, MonitorUp, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import { COVER_BUCKET } from "../../lib/profile-service";
import type { ServerMember } from "../../lib/types";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

export interface MemberVoiceActivity {
  userId: string;
  channelName: string;
  isStreaming: boolean;
}

interface MemberPanelProps {
  members: ServerMember[];
  voiceActivities?: ReadonlyArray<MemberVoiceActivity>;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  openProfileId?: string | null;
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
  openProfileId = null,
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
        member.status !== "offline" && !activityByMemberId.has(member.id),
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
            openProfileId={openProfileId}
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
  openProfileId,
}: {
  label: string;
  entries: MemberWithActivity[];
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  openProfileId: string | null;
}) {
  return (
    <section className="member-panel__group" aria-label={label}>
      <h2>
        {label} <span>— {entries.length}</span>
      </h2>
      {entries.map(({ member, activity }) => (
        <ProfileTrigger
          className={`member-panel__person ${member.status === "offline" ? "is-offline" : ""} ${activity ? "is-in-voice" : ""}`}
          key={member.id}
          member={member}
          loadMedia={loadProfileMedia}
          onOpenProfile={onOpenProfile}
          expanded={openProfileId === member.id}
          aria-label={`View ${member.displayName}'s profile`}
        >
          {({ animationUrl, animated }) => (
            <>
              <MemberCoverPoster
                member={member}
                loadProfileMedia={loadProfileMedia}
              />
              <Avatar
                user={member}
                size="small"
                showStatus
                animationUrl={animationUrl}
                animated={animated}
              />
              <span className="member-panel__identity">
                <strong>{member.displayName}</strong>
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
      ))}
    </section>
  );
}

function MemberCoverPoster({
  member,
  loadProfileMedia,
}: {
  member: ServerMember;
  loadProfileMedia: LoadProfileMedia;
}) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [requested, setRequested] = useState(Boolean(member.coverUrl));
  const [coverUrl, setCoverUrl] = useState(member.coverUrl);

  useEffect(() => {
    setRequested(Boolean(member.coverUrl));
    setCoverUrl(member.coverUrl);
  }, [member.coverPath, member.coverUrl, member.id]);

  useEffect(() => {
    if (requested || member.coverUrl || !member.coverPath) return;
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
      { root: marker.closest(".member-panel"), rootMargin: "64px" },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [member.coverPath, member.coverUrl, requested]);

  useEffect(() => {
    if (!requested || member.coverUrl || !member.coverPath) return;
    let current = true;
    void loadProfileMedia(COVER_BUCKET, member.coverPath)
      .then((url) => {
        if (current) setCoverUrl(url);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [loadProfileMedia, member.coverPath, member.coverUrl, requested]);

  return (
    <span
      ref={markerRef}
      className={`member-panel__cover ${coverUrl ? "has-media" : ""}`}
      aria-hidden="true"
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
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
