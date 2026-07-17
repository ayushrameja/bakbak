import { Crown, UserRound } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { ServerMember } from "../../lib/types";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

interface MemberPanelProps {
  members: ServerMember[];
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  openProfileId?: string | null;
}

export function MemberPanel({
  members,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  openProfileId = null,
}: MemberPanelProps) {
  const activeMembers = members.filter((member) => member.status !== "offline");
  const offlineMembers = members.filter(
    (member) => member.status === "offline",
  );

  return (
    <aside className="member-panel" id="member-panel" aria-label="Members">
      <header className="member-panel__header">
        <div>
          <span className="eyebrow">Your circle</span>
          <strong>People</strong>
        </div>
        <span>
          <UserRound size={14} /> {activeMembers.length} online
        </span>
      </header>
      <MemberGroup
        label="Online"
        members={activeMembers}
        loadProfileMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
        openProfileId={openProfileId}
      />
      <MemberGroup
        label="Offline"
        members={offlineMembers}
        loadProfileMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
        openProfileId={openProfileId}
      />
    </aside>
  );
}

function MemberGroup({
  label,
  members,
  loadProfileMedia,
  onOpenProfile,
  openProfileId,
}: {
  label: string;
  members: ServerMember[];
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  openProfileId: string | null;
}) {
  return (
    <section className="member-panel__group">
      <h2>
        {label} <span>{members.length}</span>
      </h2>
      {members.length === 0 ? (
        <p className="member-panel__empty">Nobody here right now.</p>
      ) : (
        members.map((member) => (
          <ProfileTrigger
            className={`member-panel__person ${member.status === "offline" ? "is-offline" : ""}`}
            key={member.id}
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
                <div>
                  <strong>{member.displayName}</strong>
                  <span>
                    {member.status === "online"
                      ? "Online"
                      : member.status === "idle"
                        ? "Away"
                        : "Offline"}
                  </span>
                </div>
                {member.role === "admin" ? (
                  <Crown size={13} aria-label="Admin" />
                ) : null}
              </>
            )}
          </ProfileTrigger>
        ))
      )}
    </section>
  );
}
