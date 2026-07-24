import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { AVATAR_BUCKET } from "../lib/profile-service";
import type { ServerMember } from "../lib/types";
import { useReducedMotion } from "../lib/use-reduced-motion";
import type { OpenUserContextMenu } from "./UserContextMenu";

export type LoadProfileMedia = (
  bucket: typeof AVATAR_BUCKET | "profile-covers",
  path: string | null,
  options?: { refresh?: boolean },
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
  onOpenContextMenu?: OpenUserContextMenu | undefined;
  expanded?: boolean;
  children: (state: ProfileTriggerRenderState) => ReactNode;
}

export function ProfileTrigger({
  member,
  loadMedia,
  onOpenProfile,
  onOpenContextMenu,
  expanded = false,
  children,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onContextMenu,
  onKeyDown,
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
      onContextMenu={(event: MouseEvent<HTMLButtonElement>) => {
        onContextMenu?.(event);
        if (event.defaultPrevented || !onOpenContextMenu) return;
        event.preventDefault();
        onOpenContextMenu(member, event.currentTarget, {
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          !onOpenContextMenu ||
          !(
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          )
        ) {
          return;
        }
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onOpenContextMenu(member, event.currentTarget, {
          clientX: rect.left,
          clientY: rect.bottom,
        });
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
