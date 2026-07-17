import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AVATAR_BUCKET } from "../lib/profile-service";
import type { ServerMember } from "../lib/types";
import { useReducedMotion } from "../lib/use-reduced-motion";

export type LoadProfileMedia = (
  bucket: typeof AVATAR_BUCKET | "profile-covers",
  path: string | null,
) => Promise<string | null>;

export type OpenProfile = (member: ServerMember, anchor: HTMLElement) => void;

interface ProfileTriggerRenderState {
  animationUrl: string | null;
  animated: boolean;
}

interface ProfileTriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick"
> {
  member: ServerMember;
  loadMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  expanded?: boolean;
  children: (state: ProfileTriggerRenderState) => ReactNode;
}

export function ProfileTrigger({
  member,
  loadMedia,
  onOpenProfile,
  expanded = false,
  children,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...buttonProps
}: ProfileTriggerProps) {
  const reducedMotion = useReducedMotion();
  const [engaged, setEngaged] = useState(false);
  const [animationUrl, setAnimationUrl] = useState<string | null>(null);

  useEffect(() => {
    if (
      !engaged ||
      reducedMotion ||
      member.avatarAnimationUrl ||
      !member.avatarAnimationPath
    ) {
      return;
    }
    let current = true;
    void loadMedia(AVATAR_BUCKET, member.avatarAnimationPath)
      .then((url) => {
        if (current) setAnimationUrl(url);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [
    engaged,
    loadMedia,
    member.avatarAnimationPath,
    member.avatarAnimationUrl,
    reducedMotion,
  ]);

  useEffect(() => setAnimationUrl(null), [member.avatarAnimationPath]);

  return (
    <button
      {...buttonProps}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onPointerEnter={(event) => {
        setEngaged(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setEngaged(false);
        onPointerLeave?.(event);
      }}
      onFocus={(event) => {
        setEngaged(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setEngaged(false);
        onBlur?.(event);
      }}
      onClick={(event) => onOpenProfile(member, event.currentTarget)}
    >
      {children({
        animationUrl: member.avatarAnimationUrl ?? animationUrl,
        animated: engaged && !reducedMotion,
      })}
    </button>
  );
}
