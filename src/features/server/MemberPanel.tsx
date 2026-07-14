import { Crown, UserRound } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type { ServerMember } from "../../lib/types";

interface MemberPanelProps {
  members: ServerMember[];
}

export function MemberPanel({ members }: MemberPanelProps) {
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
      <MemberGroup label="Online" members={activeMembers} />
      <MemberGroup label="Offline" members={offlineMembers} />
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
    <section className="member-panel__group">
      <h2>
        {label} <span>{members.length}</span>
      </h2>
      {members.length === 0 ? (
        <p className="member-panel__empty">Nobody here right now.</p>
      ) : (
        members.map((member) => (
          <div
            className={`member-panel__person ${member.status === "offline" ? "is-offline" : ""}`}
            key={member.id}
          >
            <Avatar user={member} size="small" showStatus />
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
          </div>
        ))
      )}
    </section>
  );
}
