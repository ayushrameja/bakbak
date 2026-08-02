import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  avatarGiphyId: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverGiphyId: null,
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
    expect(screen.getByText("Online")).toBeVisible();
    expect(
      screen.getByRole("group", { name: "User controls" }),
    ).toHaveAttribute("data-status", "online");
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

  it("keeps the compact dock free of profile cover artwork", () => {
    const loadProfileMedia = vi.fn().mockResolvedValue("blob:sidebar-cover");
    renderDock(createVoice(), {
      member: {
        ...member,
        coverUrl: "blob:existing-cover",
        coverPath: "member-1/cover.webp",
        coverAnimationPath: "member-1/cover.gif",
        coverPositionX: 28,
        coverPositionY: 72,
      },
      loadProfileMedia,
    });

    expect(document.querySelector(".user-dock__cover")).toBeNull();
    expect(loadProfileMedia).not.toHaveBeenCalled();
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
