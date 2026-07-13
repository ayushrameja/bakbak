import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ServerMember } from "../../lib/types";
import { PeopleDrawer } from "./PeopleDrawer";

const members: ServerMember[] = [
  {
    id: "member-1",
    displayName: "Mira",
    email: "mira@example.test",
    avatarUrl: null,
    status: "online",
    role: "admin",
  },
  {
    id: "member-2",
    displayName: "Jo",
    email: "jo@example.test",
    avatarUrl: null,
    status: "offline",
    role: "member",
  },
];

describe("PeopleDrawer", () => {
  it("groups people by presence and identifies admins", () => {
    render(<PeopleDrawer members={members} open onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "People" })).toBeVisible();
    expect(screen.getByText("Mira")).toBeVisible();
    expect(screen.getByText("Jo")).toBeVisible();
    expect(screen.getByLabelText("Admin")).toBeVisible();
    expect(screen.getByText("1 around right now")).toBeVisible();
  });

  it("focuses the close action, handles Escape, and returns focus", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    const { rerender } = render(
      <PeopleDrawer members={members} open onClose={onClose} />,
    );

    expect(screen.getByRole("button", { name: "Close people" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<PeopleDrawer members={members} open={false} onClose={onClose} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
