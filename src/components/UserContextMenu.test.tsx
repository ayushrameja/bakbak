import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMember } from "../lib/types";
import { UserContextMenu } from "./UserContextMenu";

const member: ServerMember = {
  id: "member-1",
  displayName: "Mira",
  email: "mira@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "online",
  role: "member",
};

const anchors: HTMLElement[] = [];

afterEach(() => {
  anchors.splice(0).forEach((anchor) => anchor.remove());
});

describe("UserContextMenu", () => {
  it("supports menu roles, keyboard navigation, actions, and focus restoration", async () => {
    const anchor = createAnchor();
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const view = render(
      <UserContextMenu
        request={{
          member,
          anchor,
          clientX: window.innerWidth,
          clientY: window.innerHeight,
        }}
        currentUserId="current-user"
        canMessage
        canToggleMute
        mutedForMe={false}
        onViewProfile={vi.fn()}
        onMessage={onMessage}
        onCopyUserId={vi.fn().mockResolvedValue(undefined)}
        onToggleMute={vi.fn()}
        onClose={onClose}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Actions for Mira" });
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "View profile" }),
      ).toHaveFocus(),
    );
    expect(Number.parseFloat(menu.style.left)).toBeLessThan(window.innerWidth);
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(window.innerHeight);
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(10);
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(10);

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Mute for me" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(
      screen.getByRole("menuitem", { name: "View profile" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Message" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onMessage).toHaveBeenCalledWith(member);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());

    view.unmount();
    expect(anchor).toHaveFocus();
  });

  it("omits self messaging, disables unavailable DMs, and exposes mute restoration", async () => {
    const selfAnchor = createAnchor();
    const selfView = render(
      <UserContextMenu
        request={{ member, anchor: selfAnchor, clientX: 20, clientY: 20 }}
        currentUserId={member.id}
        canMessage={false}
        canToggleMute={false}
        mutedForMe={false}
        onViewProfile={vi.fn()}
        onMessage={vi.fn().mockResolvedValue(undefined)}
        onCopyUserId={vi.fn().mockResolvedValue(undefined)}
        onToggleMute={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("menuitem", { name: "Message" }),
    ).not.toBeInTheDocument();
    selfView.unmount();

    const remoteAnchor = createAnchor();
    const onToggleMute = vi.fn();
    const onClose = vi.fn();
    render(
      <UserContextMenu
        request={{ member, anchor: remoteAnchor, clientX: 20, clientY: 20 }}
        currentUserId="current-user"
        canMessage={false}
        canToggleMute
        mutedForMe
        onViewProfile={vi.fn()}
        onMessage={vi.fn().mockResolvedValue(undefined)}
        onCopyUserId={vi.fn().mockResolvedValue(undefined)}
        onToggleMute={onToggleMute}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("menuitem", { name: "Message" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Unmute for me" }),
    );
    expect(onToggleMute).toHaveBeenCalledWith(member);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("routes profile and copy actions and closes on Escape", async () => {
    const anchor = createAnchor();
    const onViewProfile = vi.fn();
    const onCopyUserId = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { rerender } = render(
      <UserContextMenu
        request={{ member, anchor, clientX: 20, clientY: 20 }}
        currentUserId="current-user"
        canMessage
        canToggleMute={false}
        mutedForMe={false}
        onViewProfile={onViewProfile}
        onMessage={vi.fn().mockResolvedValue(undefined)}
        onCopyUserId={onCopyUserId}
        onToggleMute={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "View profile" }),
    );
    expect(onViewProfile).toHaveBeenCalledWith(member, anchor);

    rerender(
      <UserContextMenu
        request={{ member, anchor, clientX: 20, clientY: 20 }}
        currentUserId="current-user"
        canMessage
        canToggleMute={false}
        mutedForMe={false}
        onViewProfile={onViewProfile}
        onMessage={vi.fn().mockResolvedValue(undefined)}
        onCopyUserId={onCopyUserId}
        onToggleMute={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Copy user ID" }),
    );
    expect(onCopyUserId).toHaveBeenCalledWith(member);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

function createAnchor() {
  const anchor = document.createElement("button");
  anchor.textContent = "Open actions";
  document.body.append(anchor);
  anchors.push(anchor);
  return anchor;
}
