import { MessageCircle } from "lucide-react";

export type AppSpace = "personal" | "server";

interface DestinationRailProps {
  activeSpace: AppSpace;
  personalUnread: boolean;
  serverUnread: boolean;
  callActive: boolean;
  serverAvailable: boolean;
  onSelect: (space: AppSpace) => void;
}

export function DestinationRail({
  activeSpace,
  personalUnread,
  serverUnread,
  callActive,
  serverAvailable,
  onSelect,
}: DestinationRailProps) {
  return (
    <nav className="destination-rail" aria-label="Bakbak destinations">
      <button
        className={activeSpace === "personal" ? "is-active" : ""}
        type="button"
        aria-label="Personal"
        aria-current={activeSpace === "personal" ? "page" : undefined}
        data-tooltip="Personal"
        onClick={() => onSelect("personal")}
      >
        <img src="/bakbak.svg" alt="" />
        {personalUnread ? <i className="destination-rail__unread" /> : null}
      </button>
      <span className="destination-rail__divider" />
      <button
        className={`destination-rail__server ${activeSpace === "server" ? "is-active" : ""}`}
        type="button"
        disabled={!serverAvailable}
        aria-label={serverAvailable ? "Bakbak server" : "Server invite needed"}
        aria-current={activeSpace === "server" ? "page" : undefined}
        data-tooltip={serverAvailable ? "Bakbak" : "Invite needed"}
        onClick={() => onSelect("server")}
      >
        <span className="destination-rail__crest" aria-hidden="true">
          BB
        </span>
        {serverUnread ? <i className="destination-rail__unread" /> : null}
        {callActive ? <i className="destination-rail__call" /> : null}
      </button>
      <span className="destination-rail__spacer" />
      <span className="destination-rail__private" aria-label="Private club">
        <MessageCircle size={15} />
      </span>
    </nav>
  );
}
