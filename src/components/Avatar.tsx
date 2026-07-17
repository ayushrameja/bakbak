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
  return (
    <span
      className={`avatar avatar--${size}`}
      aria-label={`${user.displayName}, ${user.status}`}
    >
      {user.avatarUrl ? (
        <>
          <img className="avatar__poster" src={user.avatarUrl} alt="" />
          {animationUrl ? (
            <img
              className={`avatar__animation ${animated ? "is-visible" : ""}`}
              src={animationUrl}
              alt=""
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
