import { Crown, UserRound } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type { ServerMember } from "../../lib/types";

interface MemberListProps {
  members: ServerMember[];
}

export function MemberList({ members }: MemberListProps) {
  const activeMembers = members.filter((member) => member.status !== "offline");
  const offlineMembers = members.filter(
    (member) => member.status === "offline",
  );

  return (
    <aside className="member-list">
      <div className="member-list__summary">
        <UserRound size={16} />
        <span>{activeMembers.length} around right now</span>
      </div>
      <MemberGroup
        label={`Here — ${activeMembers.length}`}
        members={activeMembers}
      />
      {offlineMembers.length > 0 ? (
        <MemberGroup
          label={`Away — ${offlineMembers.length}`}
          members={offlineMembers}
        />
      ) : null}
      <div className="member-list__note">
        <span>Small room, better signal.</span>
        <p>Bakbak is intentionally built for friends, not follower counts.</p>
      </div>
    </aside>
  );
}

function MemberGroup({
  label,
  members,
}: {
  label: string;
  members: ServerMember[];
}) {
  return (
    <section className="member-group">
      <h3>{label}</h3>
      {members.map((member) => (
        <div
          className={`member-row ${member.status === "offline" ? "member-row--offline" : ""}`}
          key={member.id}
        >
          <Avatar user={member} size="small" showStatus />
          <div>
            <strong>{member.displayName}</strong>
            <span>
              {member.status === "online"
                ? "Ready to talk"
                : member.status === "idle"
                  ? "Stepped away"
                  : "Offline"}
            </span>
          </div>
          {member.role === "admin" ? (
            <Crown size={14} aria-label="Admin" />
          ) : null}
        </div>
      ))}
    </section>
  );
}
