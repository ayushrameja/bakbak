import { useState } from "react";
import type { AppUser } from "../lib/types";

interface AvatarProps {
  user: Pick<AppUser, "displayName" | "avatarUrl" | "status">;
  size?: "small" | "medium" | "large";
  showStatus?: boolean;
  animationUrl?: string | null;
  animated?: boolean;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({
  user,
  size = "medium",
  showStatus = false,
  animationUrl = null,
  animated = false,
}: AvatarProps) {
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const [failedAnimation, setFailedAnimation] = useState<string | null>(null);
  const posterUrl =
    user.avatarUrl && failedPoster !== user.avatarUrl ? user.avatarUrl : null;
  const activeAnimationUrl =
    animationUrl && failedAnimation !== animationUrl ? animationUrl : null;

  return (
    <span
      className={`avatar avatar--${size}`}
      aria-label={`${user.displayName}, ${user.status}`}
    >
      {posterUrl ? (
        <>
          <img
            className="avatar__poster"
            src={posterUrl}
            alt=""
            onError={() => setFailedPoster(posterUrl)}
          />
          {activeAnimationUrl ? (
            <img
              className={`avatar__animation ${animated ? "is-visible" : ""}`}
              src={activeAnimationUrl}
              alt=""
              onError={() => setFailedAnimation(activeAnimationUrl)}
            />
          ) : null}
        </>
      ) : (
        <span aria-hidden="true">{initials(user.displayName)}</span>
      )}
      {showStatus ? (
        <i className={`avatar__status avatar__status--${user.status}`} />
      ) : null}
    </span>
  );
}
