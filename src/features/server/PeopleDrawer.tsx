import { Crown, UserRound, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar } from "../../components/Avatar";
import type { ServerMember } from "../../lib/types";

interface PeopleDrawerProps {
  members: ServerMember[];
  open: boolean;
  onClose: () => void;
}

export function PeopleDrawer({ members, open, onClose }: PeopleDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const returnFocusTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) {
        return;
      }

      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusTo?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const activeMembers = members.filter((member) => member.status !== "offline");
  const offlineMembers = members.filter(
    (member) => member.status === "offline",
  );

  return (
    <div
      className="people-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <aside
        ref={drawerRef}
        className="people-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="people-drawer-title"
      >
        <header className="people-drawer__header">
          <div>
            <span className="eyebrow">Your circle</span>
            <h2 id="people-drawer-title">People</h2>
            <p>
              <UserRound size={15} /> {activeMembers.length} around right now
            </p>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close people"
          >
            <X size={18} />
          </button>
        </header>

        <PeopleGroup label="Here" members={activeMembers} />
        {offlineMembers.length > 0 ? (
          <PeopleGroup label="Away" members={offlineMembers} />
        ) : null}

        <footer className="people-drawer__note">
          <strong>Small room, better signal.</strong>
          <span>Bakbak is built for friends, not follower counts.</span>
        </footer>
      </aside>
    </div>
  );
}

function PeopleGroup({
  label,
  members,
}: {
  label: string;
  members: ServerMember[];
}) {
  return (
    <section className="people-drawer__group">
      <h3>
        {label} <span>{members.length}</span>
      </h3>
      {members.length === 0 ? (
        <p className="people-drawer__empty">A quiet corner for now.</p>
      ) : (
        members.map((member) => (
          <div
            className={`people-drawer__person ${member.status === "offline" ? "is-offline" : ""}`}
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
        ))
      )}
    </section>
  );
}
