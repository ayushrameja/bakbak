import type { AppUser } from "../lib/types";

interface AvatarProps {
  user: Pick<AppUser, "displayName" | "avatarUrl" | "status">;
  size?: "small" | "medium" | "large";
  showStatus?: boolean;
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
}: AvatarProps) {
  return (
    <span
      className={`avatar avatar--${size}`}
      aria-label={`${user.displayName}, ${user.status}`}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" />
      ) : (
        <span aria-hidden="true">{initials(user.displayName)}</span>
      )}
      {showStatus ? (
        <i className={`avatar__status avatar__status--${user.status}`} />
      ) : null}
    </span>
  );
}
