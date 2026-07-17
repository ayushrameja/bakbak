import { X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { AVATAR_BUCKET, COVER_BUCKET } from "../lib/profile-service";
import type { ServerMember } from "../lib/types";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { Avatar } from "./Avatar";
import type { LoadProfileMedia } from "./ProfileTrigger";

interface ProfilePopoverProps {
  member: ServerMember;
  anchor: HTMLElement;
  loadMedia: LoadProfileMedia;
  onClose: () => void;
}

interface Placement {
  left: number;
  top: number;
  origin: string;
}

export function ProfilePopover({
  member,
  anchor,
  loadMedia,
  onClose,
}: ProfilePopoverProps) {
  const cardRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const reducedMotion = useReducedMotion();
  const [placement, setPlacement] = useState<Placement>({
    left: 12,
    top: 12,
    origin: "top left",
  });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverAnimationUrl, setCoverAnimationUrl] = useState<string | null>(
    null,
  );
  const [avatarAnimationUrl, setAvatarAnimationUrl] = useState<string | null>(
    null,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let current = true;
    const load = async () => {
      const [cover, animatedCover, animatedAvatar] = await Promise.all([
        member.coverUrl
          ? Promise.resolve(member.coverUrl)
          : loadMedia(COVER_BUCKET, member.coverPath),
        reducedMotion
          ? Promise.resolve(null)
          : member.coverAnimationUrl
            ? Promise.resolve(member.coverAnimationUrl)
            : loadMedia(COVER_BUCKET, member.coverAnimationPath),
        reducedMotion
          ? Promise.resolve(null)
          : member.avatarAnimationUrl
            ? Promise.resolve(member.avatarAnimationUrl)
            : loadMedia(AVATAR_BUCKET, member.avatarAnimationPath),
      ]);
      if (!current) return;
      setCoverUrl(cover);
      setCoverAnimationUrl(animatedCover);
      setAvatarAnimationUrl(animatedAvatar);
    };
    void load().catch(() => undefined);
    return () => {
      current = false;
    };
  }, [
    loadMedia,
    member.avatarAnimationPath,
    member.avatarAnimationUrl,
    member.coverAnimationPath,
    member.coverAnimationUrl,
    member.coverPath,
    member.coverUrl,
    reducedMotion,
  ]);

  useLayoutEffect(() => {
    const update = () => {
      const card = cardRef.current;
      if (!card) return;
      if (!anchor.isConnected) {
        onCloseRef.current();
        return;
      }
      const margin = 12;
      const gap = 10;
      const anchorRect = anchor.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const width = cardRect.width || 350;
      const height = cardRect.height || 420;
      const fitsRight =
        anchorRect.right + gap + width <= window.innerWidth - margin;
      const rawLeft = fitsRight
        ? anchorRect.right + gap
        : anchorRect.left - gap - width;
      setPlacement({
        left: Math.min(
          Math.max(margin, rawLeft),
          Math.max(margin, window.innerWidth - width - margin),
        ),
        top: Math.min(
          Math.max(margin, anchorRect.top),
          Math.max(margin, window.innerHeight - height - margin),
        ),
        origin: fitsRight ? "left center" : "right center",
      });
    };
    const frame = requestAnimationFrame(update);
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (cardRef.current) observer?.observe(cardRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, member.id]);

  useLayoutEffect(() => {
    if (!anchor.isConnected) onCloseRef.current();
  });

  useEffect(() => {
    closeRef.current?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !cardRef.current?.contains(target) &&
        !anchor.contains(target)
      ) {
        onCloseRef.current();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (anchor.isConnected) anchor.focus();
    };
  }, [anchor]);

  function moveCover(event: PointerEvent<HTMLElement>) {
    if (reducedMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    event.currentTarget.style.setProperty(
      "--profile-cover-shift-x",
      `${x * 6}px`,
    );
    event.currentTarget.style.setProperty(
      "--profile-cover-shift-y",
      `${y * 6}px`,
    );
  }

  const cardStyle = {
    left: placement.left,
    top: placement.top,
    "--profile-popover-origin": placement.origin,
  } as CSSProperties;
  const coverStyle = {
    objectPosition: `${member.coverPositionX}% ${member.coverPositionY}%`,
  };

  return createPortal(
    <section
      ref={cardRef}
      className="profile-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`profile-popover-name-${member.id}`}
      style={cardStyle}
    >
      <div
        className={`profile-popover__cover ${coverUrl ? "has-media" : ""}`}
        onPointerMove={moveCover}
        onPointerLeave={(event) => {
          event.currentTarget.style.removeProperty("--profile-cover-shift-x");
          event.currentTarget.style.removeProperty("--profile-cover-shift-y");
        }}
      >
        {coverUrl ? (
          <img
            className="profile-popover__cover-poster"
            src={coverUrl}
            alt=""
            style={coverStyle}
          />
        ) : null}
        {coverAnimationUrl ? (
          <img
            className="profile-popover__cover-animation"
            src={coverAnimationUrl}
            alt=""
            style={coverStyle}
          />
        ) : null}
      </div>
      <button
        ref={closeRef}
        className="profile-popover__close"
        type="button"
        aria-label="Close profile"
        onClick={onClose}
      >
        <X size={16} />
      </button>
      <div className="profile-popover__avatar">
        <Avatar
          user={member}
          size="large"
          showStatus
          animationUrl={avatarAnimationUrl}
          animated={!reducedMotion}
        />
      </div>
      <div className="profile-popover__body">
        <div className="profile-popover__identity">
          <h2 id={`profile-popover-name-${member.id}`}>{member.displayName}</h2>
          <span className={`profile-presence is-${member.status}`}>
            {member.status === "online"
              ? "Online"
              : member.status === "idle"
                ? "Away"
                : "Offline"}
          </span>
          <span className="profile-role">
            {member.role === "admin" ? "Admin" : "Member"}
          </span>
        </div>
        {member.description ? (
          <section className="profile-popover__about" aria-label="About">
            <h3>About me</h3>
            <p>{member.description}</p>
          </section>
        ) : (
          <p className="profile-popover__mystery">
            Keeping the lore mysterious for now.
          </p>
        )}
      </div>
    </section>,
    document.body,
  );
}
