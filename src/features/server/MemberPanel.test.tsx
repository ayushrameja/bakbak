import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ServerMember } from "../../lib/types";
import { MemberPanel } from "./MemberPanel";

const members: ServerMember[] = [
  createMember({
    id: "member-1",
    displayName: "Mira",
    status: "online",
    role: "admin",
  }),
  createMember({
    id: "member-2",
    displayName: "Jo",
    status: "offline",
  }),
];

describe("MemberPanel", () => {
  it("renders only populated online and offline groups", () => {
    render(<MemberPanel members={members} />);

    expect(
      screen.getByRole("complementary", { name: "Members" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Online — 1" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Offline — 1" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /In Voice/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Mira")).toBeVisible();
    expect(screen.getByText("Jo")).toBeVisible();
    expect(screen.getByLabelText("Admin")).toBeVisible();
  });

  it("groups voice members once and sorts streaming before admin", () => {
    const asha = createMember({
      id: "member-3",
      displayName: "Asha",
      status: "idle",
    });
    render(
      <MemberPanel
        members={[...members, asha]}
        voiceActivities={[
          { userId: "member-1", channelName: "Queue", isStreaming: false },
          { userId: "member-2", channelName: "Crash", isStreaming: true },
        ]}
      />,
    );

    const voiceGroup = screen.getByRole("region", { name: "In Voice" });
    expect(
      within(voiceGroup)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["View Jo's profile", "View Mira's profile"]);
    expect(within(voiceGroup).getByText("Streaming in Crash")).toBeVisible();
    expect(within(voiceGroup).getByText("In Queue")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Online — 1" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /Offline/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Jo")).toHaveLength(1);
  });

  it("lazily resolves only the static cover poster and keeps its focal point", async () => {
    const loadProfileMedia = vi.fn().mockResolvedValue("blob:member-cover");
    const coveredMember = createMember({
      id: "member-cover",
      displayName: "Cover Star",
      status: "online",
      coverPath: "member-cover/poster.webp",
      coverAnimationPath: "member-cover/animation.gif",
      coverPositionX: 72,
      coverPositionY: 31,
    });
    const { container } = render(
      <MemberPanel
        members={[coveredMember]}
        loadProfileMedia={loadProfileMedia}
      />,
    );

    await waitFor(() =>
      expect(loadProfileMedia).toHaveBeenCalledWith(
        "profile-covers",
        coveredMember.coverPath,
      ),
    );
    const poster = container.querySelector<HTMLImageElement>(
      ".member-panel__cover img",
    );
    expect(poster).toHaveAttribute("src", "blob:member-cover");
    expect(poster).toHaveStyle({ objectPosition: "72% 31%" });
    expect(loadProfileMedia).toHaveBeenCalledTimes(1);
  });

  it("falls back to a neutral row when cover loading fails", async () => {
    const loadProfileMedia = vi.fn().mockRejectedValue(new Error("no cover"));
    const coveredMember = createMember({
      id: "member-cover",
      displayName: "Cover Star",
      status: "online",
      coverPath: "member-cover/poster.webp",
    });
    const { container } = render(
      <MemberPanel
        members={[coveredMember]}
        loadProfileMedia={loadProfileMedia}
      />,
    );

    await waitFor(() => expect(loadProfileMedia).toHaveBeenCalledOnce());
    expect(container.querySelector(".member-panel__cover img")).toBeNull();
    expect(screen.getByText("Cover Star")).toBeVisible();
  });

  it("renders one empty state when no groups exist", () => {
    render(<MemberPanel members={[]} />);
    expect(screen.getByText("Nobody here right now.")).toBeVisible();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
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

function createMember(
  overrides: Partial<ServerMember> & Pick<ServerMember, "id" | "displayName">,
): ServerMember {
  return {
    email: `${overrides.id}@example.test`,
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
    ...overrides,
  };
}
