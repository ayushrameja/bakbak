import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ServerMember } from "../../lib/types";
import { MemberPanel } from "./MemberPanel";

const members: ServerMember[] = [
  {
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
    role: "admin",
  },
  {
    id: "member-2",
    displayName: "Jo",
    email: "jo@example.test",
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
    status: "offline",
    role: "member",
  },
];

describe("MemberPanel", () => {
  it("renders online and offline groups in the page layout", () => {
    render(<MemberPanel members={members} />);

    expect(
      screen.getByRole("complementary", { name: "Members" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Online 1" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Offline 1" })).toBeVisible();
    expect(screen.getByText("Mira")).toBeVisible();
    expect(screen.getByText("Jo")).toBeVisible();
    expect(screen.getByLabelText("Admin")).toBeVisible();
  });

  it("opens the selected shared-server profile", async () => {
    const onOpenProfile = vi.fn();
    render(<MemberPanel members={members} onOpenProfile={onOpenProfile} />);
    const trigger = screen.getByRole("button", {
      name: "View Mira's profile",
    });
    await userEvent.click(trigger);
    expect(onOpenProfile).toHaveBeenCalledWith(members[0], trigger);
  });
});
