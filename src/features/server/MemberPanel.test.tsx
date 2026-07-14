import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ServerMember } from "../../lib/types";
import { MemberPanel } from "./MemberPanel";

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
});
