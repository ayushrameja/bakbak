import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, Channel, Server } from "../../lib/types";
import { ChannelSidebar } from "./ChannelSidebar";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
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
  name: "Lounge",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};

function renderSidebar(
  channels: Channel[],
  overrides: Partial<React.ComponentProps<typeof ChannelSidebar>> = {},
) {
  const props: React.ComponentProps<typeof ChannelSidebar> = {
    server,
    channels,
    selectedChannelId: channels[0]?.id ?? "",
    user,
    voiceOccupants: [],
    unreadChannelIds: new Set(),
    canManageChannels: false,
    onSelect: vi.fn(),
    onCreateChannel: vi.fn(),
    onRenameChannel: vi.fn(),
    onOpenSettings: vi.fn(),
    onSignOut: vi.fn(),
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
      screen.getByRole("button", { name: "Create Voice rooms" }),
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
      screen.queryByRole("button", { name: "Create Voice rooms" }),
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
        },
      ],
    });
    expect(screen.getByText("Mira")).toBeVisible();
  });
});
