import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { AVATAR_BUCKET } from "../lib/profile-service";
import { resolveGiphyProfileMedia } from "../lib/profile-giphy-media";
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
  engaged: boolean;
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
  autoPlayAnimation?: boolean;
  children: (state: ProfileTriggerRenderState) => ReactNode;
}

export function ProfileTrigger({
  member,
  loadMedia,
  onOpenProfile,
  onOpenContextMenu,
  expanded = false,
  autoPlayAnimation = false,
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
      (!engaged && !autoPlayAnimation) ||
      reducedMotion ||
      member.avatarAnimationUrl ||
      (!member.avatarAnimationPath && !member.avatarGiphyId)
    ) {
      return;
    }
    let current = true;
    const animation = member.avatarGiphyId
      ? resolveGiphyProfileMedia(member, {
          includeAvatarAnimation: true,
        }).then((media) => media.avatarAnimationUrl)
      : loadMedia(AVATAR_BUCKET, member.avatarAnimationPath);
    void animation
      .then((url) => {
        if (current) setAnimationUrl(url);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [
    autoPlayAnimation,
    engaged,
    loadMedia,
    member,
    member.avatarAnimationPath,
    member.avatarAnimationUrl,
    member.avatarGiphyId,
    reducedMotion,
  ]);

  useEffect(
    () => setAnimationUrl(null),
    [member.avatarAnimationPath, member.avatarGiphyId],
  );

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
        animationUrl: reducedMotion
          ? null
          : (member.avatarAnimationUrl ?? animationUrl),
        animated: (engaged || autoPlayAnimation) && !reducedMotion,
        engaged,
      })}
    </button>
  );
}
