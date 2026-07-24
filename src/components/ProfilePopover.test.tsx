import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMember } from "../lib/types";
import { ProfilePopover } from "./ProfilePopover";
import { ProfileTrigger } from "./ProfileTrigger";
import { Avatar } from "./Avatar";

const member: ServerMember = {
  id: "member-1",
  displayName: "Mira",
  email: "private@example.test",
  avatarUrl: "data:image/webp;base64,poster",
  avatarAnimationUrl: null,
  avatarPath: "member-1/avatar-poster",
  avatarAnimationPath: "member-1/avatar-animation",
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: "member-1/cover-poster",
  coverAnimationPath: "member-1/cover-animation",
  coverPositionX: 65,
  coverPositionY: 35,
  description: "Tea, prototypes, and very specific playlists.",
  status: "online",
  role: "admin",
};

describe("rich profile surfaces", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows only member-facing fields and restores focus when closed", async () => {
    const anchor = document.createElement("button");
    anchor.textContent = "Mira";
    document.body.append(anchor);
    anchor.focus();
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      x: 900,
      y: 30,
      width: 80,
      height: 40,
      top: 30,
      right: 980,
      bottom: 70,
      left: 900,
      toJSON: () => ({}),
    });
    const loadMedia = vi.fn((_bucket: string, path: string | null) =>
      Promise.resolve(path ? `blob:${path}` : null),
    );
    const onClose = vi.fn();
    const view = render(
      <ProfilePopover
        member={member}
        anchor={anchor}
        loadMedia={loadMedia}
        onClose={onClose}
      />,
    );

    expect(await screen.findByRole("dialog", { name: "Mira" })).toBeVisible();
    expect(screen.getByText(member.description)).toBeVisible();
    expect(screen.getByText("Admin")).toBeVisible();
    expect(screen.queryByText(member.email)).not.toBeInTheDocument();
    await waitFor(() => expect(loadMedia).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Mira" })).toHaveStyle({
        left: "540px",
        top: "30px",
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Close profile" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(anchor).toHaveFocus();
    anchor.remove();
  });

  it("dismisses on outside interaction and Escape", () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const onOutsideClose = vi.fn();
    const outsideView = render(
      <ProfilePopover
        member={member}
        anchor={anchor}
        loadMedia={vi.fn().mockResolvedValue(null)}
        onClose={onOutsideClose}
      />,
    );
    fireEvent.mouseDown(document.body);
    expect(onOutsideClose).toHaveBeenCalledOnce();
    outsideView.unmount();

    const onEscapeClose = vi.fn();
    const escapeView = render(
      <ProfilePopover
        member={member}
        anchor={anchor}
        loadMedia={vi.fn().mockResolvedValue(null)}
        onClose={onEscapeClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscapeClose).toHaveBeenCalledOnce();
    escapeView.unmount();
    anchor.remove();
  });

  it("loads animation only after a profile trigger is engaged", async () => {
    const loadMedia = vi.fn().mockResolvedValue("blob:animated-avatar");
    const onOpenProfile = vi.fn();
    render(
      <ProfileTrigger
        member={member}
        loadMedia={loadMedia}
        onOpenProfile={onOpenProfile}
      >
        {({ animationUrl, animated }) => (
          <Avatar
            user={member}
            animationUrl={animationUrl}
            animated={animated}
          />
        )}
      </ProfileTrigger>,
    );

    expect(loadMedia).not.toHaveBeenCalled();
    const trigger = screen.getByRole("button");
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(loadMedia).toHaveBeenCalledWith(
        "avatars",
        member.avatarAnimationPath,
      ),
    );
    expect(document.querySelector(".avatar__animation")).toHaveClass(
      "is-visible",
    );
    await userEvent.click(trigger);
    expect(onOpenProfile).toHaveBeenCalledWith(member, trigger);
  });

  it("opens user actions from pointer and keyboard context gestures", () => {
    const onOpenContextMenu = vi.fn();
    render(
      <ProfileTrigger
        member={member}
        loadMedia={vi.fn().mockResolvedValue(null)}
        onOpenProfile={vi.fn()}
        onOpenContextMenu={onOpenContextMenu}
      >
        {() => <span>Mira</span>}
      </ProfileTrigger>,
    );

    const trigger = screen.getByRole("button");
    fireEvent.contextMenu(trigger, { clientX: 40, clientY: 80 });
    expect(onOpenContextMenu).toHaveBeenLastCalledWith(member, trigger, {
      clientX: 40,
      clientY: 80,
    });

    fireEvent.keyDown(trigger, { key: "F10", shiftKey: true });
    expect(onOpenContextMenu).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(trigger, { key: "ContextMenu" });
    expect(onOpenContextMenu).toHaveBeenCalledTimes(3);
  });

  it("never requests animated media when reduced motion is enabled", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const loadMedia = vi.fn().mockResolvedValue("blob:poster");
    const view = render(
      <ProfilePopover
        member={member}
        anchor={anchor}
        loadMedia={loadMedia}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(loadMedia).toHaveBeenCalledOnce());
    expect(loadMedia).toHaveBeenCalledWith("profile-covers", member.coverPath);
    expect(loadMedia).not.toHaveBeenCalledWith(
      "profile-covers",
      member.coverAnimationPath,
    );
    expect(loadMedia).not.toHaveBeenCalledWith(
      "avatars",
      member.avatarAnimationPath,
    );
    view.unmount();
    anchor.remove();
  });
});
