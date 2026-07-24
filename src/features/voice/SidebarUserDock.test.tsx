import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { COVER_BUCKET } from "../../lib/profile-service";
import type { ServerMember } from "../../lib/types";
import { SidebarUserDock } from "./SidebarUserDock";
import type { useVoiceRoom } from "./useVoiceRoom";

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

describe("SidebarUserDock", () => {
  it("keeps profile and settings available outside a call", async () => {
    const onOpenProfile = vi.fn();
    const onOpenSettings = vi.fn();
    renderDock(createVoice(), { onOpenProfile, onOpenSettings });

    expect(screen.getByRole("group", { name: "User controls" })).toBeVisible();
    expect(screen.getByText("Available")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mute" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "View Mira's profile" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("uses destructive active states for mute and deafen", async () => {
    const toggleMute = vi.fn().mockResolvedValue(undefined);
    const toggleDeafen = vi.fn().mockResolvedValue(undefined);
    renderDock(
      createVoice({
        status: "connected",
        muted: true,
        deafened: true,
        toggleMute,
        toggleDeafen,
      }),
    );

    const unmute = screen.getByRole("button", { name: "Unmute" });
    const undeafen = screen.getByRole("button", { name: "Undeafen" });
    expect(unmute).toHaveClass("is-danger");
    expect(unmute).toHaveAttribute("aria-pressed", "true");
    expect(undeafen).toHaveClass("is-danger");
    await userEvent.click(unmute);
    await userEvent.click(undeafen);
    expect(toggleMute).toHaveBeenCalledOnce();
    expect(toggleDeafen).toHaveBeenCalledOnce();
  });

  it("loads the static cover as a focal background without requesting animation", async () => {
    const loadProfileMedia = vi.fn().mockResolvedValue("blob:sidebar-cover");
    renderDock(createVoice(), {
      member: {
        ...member,
        coverPath: "member-1/cover.webp",
        coverAnimationPath: "member-1/cover.gif",
        coverPositionX: 28,
        coverPositionY: 72,
      },
      loadProfileMedia,
    });

    await waitFor(() =>
      expect(document.querySelector(".user-dock__cover img")).not.toBeNull(),
    );
    expect(loadProfileMedia).toHaveBeenCalledWith(
      COVER_BUCKET,
      "member-1/cover.webp",
    );
    expect(loadProfileMedia).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".user-dock__cover img")).toHaveStyle({
      objectPosition: "28% 72%",
    });
  });

  it("keeps a neutral dock when the cover download fails", async () => {
    const loadProfileMedia = vi.fn().mockRejectedValue(new Error("no cover"));
    renderDock(createVoice(), {
      member: { ...member, coverPath: "member-1/missing.webp" },
      loadProfileMedia,
    });

    await waitFor(() => expect(loadProfileMedia).toHaveBeenCalledOnce());
    expect(document.querySelector(".user-dock__cover")).toBeNull();
  });
});

function renderDock(
  voice: ReturnType<typeof useVoiceRoom>,
  overrides: Partial<React.ComponentProps<typeof SidebarUserDock>> = {},
) {
  const props: React.ComponentProps<typeof SidebarUserDock> = {
    member,
    voice,
    loadProfileMedia: vi.fn().mockResolvedValue(null),
    onOpenProfile: vi.fn(),
    openProfileId: null,
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  return render(<SidebarUserDock {...props} />);
}

function createVoice(
  overrides: Partial<ReturnType<typeof useVoiceRoom>> = {},
): ReturnType<typeof useVoiceRoom> {
  return {
    status: "disconnected",
    muted: false,
    deafened: false,
    toggleMute: vi.fn().mockResolvedValue(undefined),
    toggleDeafen: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ReturnType<typeof useVoiceRoom>;
}
