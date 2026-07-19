import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  AppUser,
  Channel,
  ChannelCategory,
  Server,
  ServerMember,
} from "../../lib/types";
import type { useVoiceRoom } from "../voice/useVoiceRoom";
import { ChannelSidebar } from "./ChannelSidebar";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
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
};

const server: Server = {
  id: "server-1",
  name: "Bakbak",
  description: "Friends only",
};

const voiceChannel: Channel = {
  id: "voice-1",
  serverId: server.id,
  categoryId: null,
  name: "Lounge",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};
const friend: ServerMember = {
  ...user,
  id: "friend-1",
  displayName: "Mira",
  email: "mira@example.test",
  role: "member",
};

function renderSidebar(
  channels: Channel[],
  overrides: Partial<React.ComponentProps<typeof ChannelSidebar>> = {},
) {
  const props: React.ComponentProps<typeof ChannelSidebar> = {
    server,
    categories: [],
    channels,
    selectedChannelId: channels[0]?.id ?? "",
    user,
    voiceOccupants: [],
    unreadChannelIds: new Set(),
    voice: {
      status: "disconnected",
      channel: null,
    } as unknown as ReturnType<typeof useVoiceRoom>,
    mode: "mock",
    soundboardOpen: false,
    canManageChannels: false,
    onSelect: vi.fn(),
    onPrepareVoiceChannel: vi.fn(),
    onCreateChannel: vi.fn(),
    onRenameChannel: vi.fn(),
    onOpenSettings: vi.fn(),
    onToggleSoundboard: vi.fn(),
    onOpenScreenShare: vi.fn(),
    ...overrides,
  };
  render(<ChannelSidebar {...props} />);
  return props;
}

describe("ChannelSidebar room shelf", () => {
  it("shows create and rename controls only to admins", async () => {
    const onCreateChannel = vi.fn();
    const onRenameChannel = vi.fn();
    renderSidebar([voiceChannel], {
      canManageChannels: true,
      onCreateChannel,
      onRenameChannel,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Create voice channel" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Rename Lounge" }),
    );
    expect(onCreateChannel).toHaveBeenCalledWith("voice");
    expect(onRenameChannel).toHaveBeenCalledWith(voiceChannel);
  });

  it("hides management controls from ordinary members", () => {
    renderSidebar([voiceChannel]);
    expect(
      screen.queryByRole("button", { name: "Create voice channel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rename Lounge" }),
    ).not.toBeInTheDocument();
  });

  it("emphasizes unread text channels", () => {
    const textChannel: Channel = {
      ...voiceChannel,
      id: "text-1",
      name: "random",
      kind: "text",
    };
    renderSidebar([textChannel], {
      selectedChannelId: "different-channel",
      unreadChannelIds: new Set([textChannel.id]),
    });

    expect(screen.getByRole("button", { name: /random/i })).toHaveClass(
      "channel-row--unread",
    );
  });

  it("does not expose unread state for voice channels", () => {
    renderSidebar([voiceChannel], {
      selectedChannelId: "different-channel",
      unreadChannelIds: new Set([voiceChannel.id]),
    });

    expect(screen.getByRole("button", { name: /Lounge/i })).not.toHaveClass(
      "channel-row--unread",
    );
  });

  it("renders mixed text and voice channels in category and room order", () => {
    const categories: ChannelCategory[] = [
      {
        id: "category-gamez",
        serverId: server.id,
        name: "Gamez",
        position: 20,
      },
      {
        id: "category-welcome",
        serverId: server.id,
        name: "Welcome",
        position: 10,
      },
    ];
    const channels: Channel[] = [
      {
        ...voiceChannel,
        id: "voice-queue",
        categoryId: "category-gamez",
        name: "Queue",
        position: 20,
      },
      {
        ...voiceChannel,
        id: "text-clips",
        categoryId: "category-gamez",
        name: "clips",
        kind: "text",
        position: 10,
      },
      {
        ...voiceChannel,
        id: "text-spawn",
        categoryId: "category-welcome",
        name: "spawn",
        kind: "text",
        position: 10,
      },
    ];

    renderSidebar(channels, { categories });

    const categoryRegions = screen.getAllByRole("region");
    expect(
      categoryRegions.map((region) => region.getAttribute("aria-label")),
    ).toEqual(["Welcome", "Gamez"]);
    expect(
      within(screen.getByRole("region", { name: "Gamez" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["clips", "Queue"]);
  });

  it("prepares voice channels for pointer and keyboard discovery", () => {
    const onPrepareVoiceChannel = vi.fn();
    renderSidebar([voiceChannel], { onPrepareVoiceChannel });
    const button = screen.getByRole("button", { name: /Lounge/i });

    fireEvent.pointerEnter(button);
    fireEvent.focus(button);

    expect(onPrepareVoiceChannel).toHaveBeenCalledTimes(2);
    expect(onPrepareVoiceChannel).toHaveBeenLastCalledWith(voiceChannel);
  });

  it("shows voice occupants without joining the room", () => {
    renderSidebar([voiceChannel], {
      selectedChannelId: "text-1",
      voiceOccupants: [
        {
          userId: "friend-1",
          displayName: "Mira",
          avatarUrl: null,
          channelId: voiceChannel.id,
          joinedAt: new Date().toISOString(),
          isStreaming: false,
        },
      ],
    });
    expect(screen.getByText("Mira")).toBeVisible();
  });

  it("shows server-wide LIVE state and watches without opening a profile", async () => {
    const onWatch = vi.fn();
    const onOpenProfile = vi.fn();
    const occupant = {
      userId: friend.id,
      displayName: friend.displayName,
      avatarUrl: null,
      channelId: voiceChannel.id,
      joinedAt: new Date().toISOString(),
      isStreaming: true,
    };
    renderSidebar([voiceChannel], {
      members: [{ ...user, role: "admin" }, friend],
      voiceOccupants: [occupant],
      onWatch,
      onOpenProfile,
    });

    expect(screen.getByText("LIVE")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Watch Mira" }));
    expect(onWatch).toHaveBeenCalledWith(occupant, voiceChannel);
    expect(onOpenProfile).not.toHaveBeenCalled();
  });

  it("opens voice-occupant and signed-in user profiles", async () => {
    const onOpenProfile = vi.fn();
    renderSidebar([voiceChannel], {
      members: [{ ...user, role: "admin" }, friend],
      voiceOccupants: [
        {
          userId: friend.id,
          displayName: friend.displayName,
          avatarUrl: null,
          channelId: voiceChannel.id,
          joinedAt: new Date().toISOString(),
          isStreaming: false,
        },
      ],
      onOpenProfile,
    });

    const occupantTrigger = screen.getByRole("button", {
      name: "View Mira's profile",
    });
    await userEvent.click(occupantTrigger);
    expect(onOpenProfile).toHaveBeenCalledWith(friend, occupantTrigger);

    const userTrigger = screen.getByRole("button", {
      name: "View Ayu's profile",
    });
    await userEvent.click(userTrigger);
    expect(onOpenProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: user.id }),
      userTrigger,
    );
  });
});
