import { Copy, MessageCircle, UserRound, Volume2, VolumeX } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ServerMember } from "../lib/types";

export interface UserContextMenuRequest {
  member: ServerMember;
  anchor: HTMLElement;
  clientX: number;
  clientY: number;
}

export type OpenUserContextMenu = (
  member: ServerMember,
  anchor: HTMLElement,
  point?: { clientX: number; clientY: number },
) => void;

interface UserContextMenuProps {
  request: UserContextMenuRequest;
  currentUserId: string;
  canMessage: boolean;
  canToggleMute: boolean;
  mutedForMe: boolean;
  onViewProfile: (member: ServerMember, anchor: HTMLElement) => void;
  onMessage: (member: ServerMember) => Promise<void>;
  onCopyUserId: (member: ServerMember) => Promise<void>;
  onToggleMute: (member: ServerMember) => void;
  onClose: () => void;
}

interface MenuItemProps {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  onSelect: () => void | Promise<void>;
}

export function UserContextMenu({
  request,
  currentUserId,
  canMessage,
  canToggleMute,
  mutedForMe,
  onViewProfile,
  onMessage,
  onCopyUserId,
  onToggleMute,
  onClose,
}: UserContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [placement, setPlacement] = useState({
    left: request.clientX,
    top: request.clientY,
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 10;
    const rect = menu.getBoundingClientRect();
    setPlacement({
      left: Math.min(
        Math.max(margin, request.clientX),
        Math.max(margin, window.innerWidth - rect.width - margin),
      ),
      top: Math.min(
        Math.max(margin, request.clientY),
        Math.max(margin, window.innerHeight - rect.height - margin),
      ),
    });
    menu
      .querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [request]);

  useEffect(() => {
    const closeFromPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        onCloseRef.current();
      }
    };
    const closeFromWindowChange = () => onCloseRef.current();
    document.addEventListener("pointerdown", closeFromPointer, true);
    window.addEventListener("blur", closeFromWindowChange);
    window.addEventListener("resize", closeFromWindowChange);
    window.addEventListener("scroll", closeFromWindowChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromPointer, true);
      window.removeEventListener("blur", closeFromWindowChange);
      window.removeEventListener("resize", closeFromWindowChange);
      window.removeEventListener("scroll", closeFromWindowChange, true);
      if (request.anchor.isConnected) request.anchor.focus();
    };
  }, [request.anchor]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
    if (!items.length) return;
    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  const runAndClose = (action: () => void | Promise<void>) => {
    void Promise.resolve()
      .then(action)
      .catch(() => undefined)
      .finally(onClose);
  };

  return createPortal(
    <div
      ref={menuRef}
      className="user-context-menu"
      role="menu"
      aria-label={`Actions for ${request.member.displayName}`}
      style={placement}
      onKeyDown={handleKeyDown}
    >
      <MenuItem
        icon={<UserRound size={16} />}
        onSelect={() =>
          runAndClose(() => onViewProfile(request.member, request.anchor))
        }
      >
        View profile
      </MenuItem>
      {request.member.id !== currentUserId ? (
        <MenuItem
          disabled={!canMessage}
          icon={<MessageCircle size={16} />}
          onSelect={() => runAndClose(() => onMessage(request.member))}
        >
          Message
        </MenuItem>
      ) : null}
      <MenuItem
        icon={<Copy size={16} />}
        onSelect={() => runAndClose(() => onCopyUserId(request.member))}
      >
        Copy user ID
      </MenuItem>
      {canToggleMute ? (
        <MenuItem
          icon={mutedForMe ? <Volume2 size={16} /> : <VolumeX size={16} />}
          onSelect={() => runAndClose(() => onToggleMute(request.member))}
        >
          {mutedForMe ? "Unmute for me" : "Mute for me"}
        </MenuItem>
      ) : null}
    </div>,
    document.body,
  );
}

function MenuItem({
  children,
  disabled = false,
  icon,
  onSelect,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onSelect()}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
