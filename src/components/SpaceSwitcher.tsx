import { useRef, type KeyboardEvent } from "react";
import type { AppSpace } from "../features/server/app-space";

export interface SpaceSwitcherProps {
  activeSpace: AppSpace;
  personalUnread: boolean;
  serverUnread: boolean;
  callActive: boolean;
  serverAvailable: boolean;
  disabled?: boolean;
  onSelect: (space: AppSpace) => void;
}

export function SpaceSwitcher({
  activeSpace,
  personalUnread,
  serverUnread,
  callActive,
  serverAvailable,
  disabled = false,
  onSelect,
}: SpaceSwitcherProps) {
  const personalRef = useRef<HTMLButtonElement>(null);
  const serverRef = useRef<HTMLButtonElement>(null);

  function selectFromKeyboard(
    event: KeyboardEvent<HTMLElement>,
    space: AppSpace,
  ) {
    if (disabled || (space === "server" && !serverAvailable)) return;
    event.preventDefault();
    onSelect(space);
    (space === "personal" ? personalRef : serverRef).current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft" || event.key === "Home") {
      selectFromKeyboard(event, "personal");
    } else if (event.key === "ArrowRight" || event.key === "End") {
      selectFromKeyboard(event, "server");
    }
  }

  return (
    <nav
      className="space-switcher"
      aria-label="Bakbak spaces"
      onKeyDown={handleKeyDown}
    >
      <button
        ref={personalRef}
        className={activeSpace === "personal" ? "is-active" : ""}
        type="button"
        aria-label="Personal"
        aria-current={activeSpace === "personal" ? "page" : undefined}
        aria-describedby={personalUnread ? "personal-space-status" : undefined}
        disabled={disabled}
        onClick={() => onSelect("personal")}
      >
        <span>Personal</span>
        {personalUnread ? (
          <i className="space-switcher__unread" aria-hidden="true" />
        ) : null}
      </button>
      <button
        ref={serverRef}
        className={activeSpace === "server" ? "is-active" : ""}
        type="button"
        aria-label={serverAvailable ? "Bakbak server" : "Server invite needed"}
        aria-current={activeSpace === "server" ? "page" : undefined}
        aria-describedby={
          serverUnread || callActive ? "server-space-status" : undefined
        }
        title={serverAvailable ? "Bakbak server" : "Invite needed"}
        disabled={disabled || !serverAvailable}
        onClick={() => onSelect("server")}
      >
        <span>Bakbak</span>
        {serverUnread ? (
          <i className="space-switcher__unread" aria-hidden="true" />
        ) : null}
        {callActive ? (
          <i className="space-switcher__call" aria-hidden="true" />
        ) : null}
      </button>
      {personalUnread ? (
        <span className="visually-hidden" id="personal-space-status">
          Unread personal messages
        </span>
      ) : null}
      {serverUnread || callActive ? (
        <span className="visually-hidden" id="server-space-status">
          {serverUnread ? "Unread server messages. " : ""}
          {callActive ? "Voice call active." : ""}
        </span>
      ) : null}
    </nav>
  );
}
