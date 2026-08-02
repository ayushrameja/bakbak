import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ServerMember } from "../../lib/types";
import { MemberPanel } from "./MemberPanel";

const giphyState = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("../../lib/profile-giphy-media", () => ({
  resolveGiphyProfileMedia: giphyState.resolve,
}));

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
          {
            userId: "member-1",
            channelId: "voice-queue",
            channelName: "Queue",
            isStreaming: false,
          },
          {
            userId: "member-2",
            channelId: "voice-crash",
            channelName: "Crash",
            isStreaming: true,
          },
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
    expect(screen.getByRole("heading", { name: "Away — 1" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /Offline/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Jo")).toHaveLength(1);
  });

  it("autoplays a cover GIF over its static poster and keeps its focal point", async () => {
    const loadProfileMedia = vi.fn((_: string, path: string | null) =>
      Promise.resolve(
        path?.endsWith("animation.gif")
          ? "blob:member-animation"
          : "blob:member-cover",
      ),
    );
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
    expect(
      container.querySelector<HTMLImageElement>(
        ".member-cover-poster__animation",
      ),
    ).toHaveAttribute("src", "blob:member-animation");
    expect(loadProfileMedia).toHaveBeenCalledWith(
      "profile-covers",
      coveredMember.coverAnimationPath,
    );
    expect(loadProfileMedia).toHaveBeenCalledTimes(2);
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

  it("autoplays a visible GIPHY cover without hover", async () => {
    giphyState.resolve.mockResolvedValue({
      avatarPosterUrl: null,
      avatarAnimationUrl: null,
      coverPosterUrl: "https://media.giphy.test/cover.webp",
      coverAnimationUrl: "https://media.giphy.test/cover.gif",
    });
    const coveredMember = createMember({
      id: "member-giphy-cover",
      displayName: "Provider Cover",
      status: "online",
      coverGiphyId: "cover-gif",
    });
    const { container } = render(<MemberPanel members={[coveredMember]} />);

    await waitFor(() => expect(giphyState.resolve).toHaveBeenCalledOnce());
    expect(
      container.querySelector<HTMLImageElement>(".member-panel__cover img"),
    ).toHaveAttribute("src", "https://media.giphy.test/cover.webp");
    expect(
      container.querySelector<HTMLImageElement>(
        ".member-cover-poster__animation",
      ),
    ).toHaveAttribute("src", "https://media.giphy.test/cover.gif");
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

  it("offers a remote streaming member watch action with its voice channel", async () => {
    const onWatchStream = vi.fn();
    render(
      <MemberPanel
        members={members}
        currentUserId="current-user"
        voiceActivities={[
          {
            userId: members[0]!.id,
            channelId: "voice-lounge",
            channelName: "Lounge",
            isStreaming: true,
          },
        ]}
        onWatchStream={onWatchStream}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Watch Mira's stream" }),
    );
    expect(onWatchStream).toHaveBeenCalledWith(members[0], "voice-lounge");
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
    avatarGiphyId: null,
    coverUrl: null,
    coverAnimationUrl: null,
    coverPath: null,
    coverAnimationPath: null,
    coverGiphyId: null,
    coverPositionX: 50,
    coverPositionY: 50,
    description: "",
    status: "offline",
    role: "member",
    ...overrides,
  };
}
