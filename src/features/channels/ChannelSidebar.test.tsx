import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser, Channel, Server, ServerMember } from "../../lib/types";
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
};

const server: Server = {
  id: "server-1",
  name: "Bakbak",
  description: "Friends only",
};

const channels: Channel[] = [
  room("welcome", "Welcome", "text", 100, "system-general"),
  room("chat", "Chat", "text", 200),
  room("volt", "Volt", "text", 300),
  room("random", "Random Things", "text", 400),
  room("game-1", "Game #1", "voice", 1100),
  room("game-2", "Game #2", "voice", 1200),
  room("game-3", "Game #3", "voice", 1300),
];

const currentMember = member("user-1", "Ayu", "online", "admin");
const mira = member("mira", "Mira", "online");
const jo = member("jo", "Jo", "idle");
const kabir = member("kabir", "Kabir", "offline");

function renderSidebar(
  overrides: Partial<React.ComponentProps<typeof ChannelSidebar>> = {},
) {
  const props: React.ComponentProps<typeof ChannelSidebar> = {
    server,
    categories: [
      {
        id: "category-channels",
        serverId: server.id,
        name: "Channels",
        position: 10,
      },
    ],
    channels,
    selectedChannelId: "chat",
    user,
    members: [currentMember, mira, jo, kabir],
    voiceOccupants: [],
    memberVoiceActivities: [],
    unreadChannelIds: new Set(),
    voice: {
      status: "disconnected",
      channel: null,
    } as unknown as ReturnType<typeof useVoiceRoom>,
    canManageChannels: false,
    activeSpace: "server",
    personalUnread: false,
    serverUnread: false,
    serverAvailable: true,
    onSelectSpace: vi.fn(),
    onSelect: vi.fn(),
    onPrepareVoiceChannel: vi.fn(),
    onCreateChannel: vi.fn(),
    onRenameChannel: vi.fn(),
    onOpenSettings: vi.fn(),
    soundboardOpen: false,
    onToggleSoundboard: vi.fn(),
    onOpenScreenShare: vi.fn(),
    onOpenProfile: vi.fn(),
    onOpenUserContextMenu: vi.fn(),
    onMessageMember: vi.fn(),
    onWatchStream: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ChannelSidebar {...props} />) };
}

describe("ChannelSidebar unified navigation", () => {
  beforeEach(() => window.localStorage.clear());

  it("renders one flat Channels list in the accepted exact order", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Channels" });
    expect(
      within(nav)
        .getAllByRole("button")
        .filter(
          (button) =>
            button.hasAttribute("aria-current") ||
            button.classList.contains("channel-row"),
        )
        .map((button) => button.textContent),
    ).toEqual([
      "Welcome",
      "Chat",
      "Volt",
      "Random Things",
      "Game #1",
      "Game #2",
      "Game #3",
    ]);
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("keeps the Personal/Bakbak switch keyboard operable inside the sidebar", async () => {
    const onSelectSpace = vi.fn();
    renderSidebar({ onSelectSpace });
    const personal = screen.getByRole("button", { name: "Personal" });
    personal.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onSelectSpace).toHaveBeenCalledWith("server");
    await userEvent.keyboard("{Home}");
    expect(onSelectSpace).toHaveBeenLastCalledWith("personal");
  });

  it("shows six members regardless of status, prioritizing voice and presence", () => {
    const zed = member("zed", "Zed", "online");
    const amy = member("amy", "Amy", "online");
    const noa = member("noa", "Noa", "idle");
    renderSidebar({
      members: [currentMember, zed, jo, mira, amy, noa, kabir],
      memberVoiceActivities: [
        {
          userId: jo.id,
          channelId: "game-1",
          channelName: "Game #1",
          isStreaming: false,
        },
      ],
    });
    const preview = screen.getByLabelText("Activity");
    expect(
      within(preview)
        .getAllByRole("button", { name: /^View/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "View Jo's profile",
      "View Amy's profile",
      "View Mira's profile",
      "View Zed's profile",
      "View Noa's profile",
      "View Kabir's profile",
    ]);
    expect(
      within(preview).getByRole("button", { name: "Show all" }),
    ).toBeVisible();
    expect(
      within(preview)
        .getByLabelText("Mira, online")
        .querySelector(".avatar__status--online"),
    ).not.toBeNull();
  });

  it("collapses Activity without moving Channels and restores the saved choice", async () => {
    const firstView = renderSidebar();
    const collapse = screen.getByRole("button", {
      name: "Collapse Activity",
    });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "View Mira's profile" }),
    ).toBeVisible();

    await userEvent.click(collapse);
    expect(
      screen.getByRole("button", { name: "Expand Activity" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "View Mira's profile" }),
    ).toBeNull();
    expect(screen.getByRole("navigation", { name: "Channels" })).toBeVisible();

    firstView.unmount();
    renderSidebar();
    const restored = screen.getByRole("button", { name: "Expand Activity" });
    expect(restored).toHaveAttribute("aria-expanded", "false");
    restored.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "View Mira's profile" }),
    ).toBeVisible();
  });

  it("autoplays avatar and cover GIFs in Activity rows", () => {
    const animatedMember = {
      ...member("animated", "Animated", "online"),
      avatarUrl: "blob:avatar-poster",
      avatarAnimationUrl: "blob:avatar-animation",
      coverUrl: "blob:cover-poster",
      coverAnimationUrl: "blob:cover-animation",
    };
    const { container } = renderSidebar({
      members: [currentMember, animatedMember],
    });

    expect(
      container.querySelector<HTMLImageElement>(".avatar__animation"),
    ).toHaveClass("is-visible");
    expect(
      container.querySelector<HTMLImageElement>(
        ".activity-preview .member-cover-poster__animation",
      ),
    ).toHaveAttribute("src", "blob:cover-animation");
  });

  it("shows a purposeful empty presence state", () => {
    renderSidebar({ members: [currentMember] });
    expect(
      screen.getByText(/suspicious amount of productivity/i),
    ).toBeVisible();
  });

  it("keeps the former member-rail cover texture in Activity rows", () => {
    const covered = {
      ...member("covered", "Covered", "online"),
      coverUrl: "blob:activity-cover",
      coverPositionX: 72,
      coverPositionY: 31,
    };
    const { container } = renderSidebar({
      members: [currentMember, covered],
    });
    const cover = container.querySelector<HTMLImageElement>(
      ".activity-preview__cover img",
    );
    expect(cover).toHaveAttribute("src", "blob:activity-cover");
    expect(cover).toHaveStyle({ objectPosition: "72% 31%" });
  });

  it("opens a focus-trapped grouped member overlay and restores Show all focus", async () => {
    renderSidebar();
    const opener = screen.getByRole("button", { name: "Show all" });
    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Members" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Online — 2" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Away — 1" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Offline — 1" })).toBeVisible();
    expect(screen.getByText("Ayu (You)")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Members" })).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("preserves profile, context, DM, and stream actions in the member overlay", async () => {
    const onOpenProfile = vi.fn();
    const onOpenUserContextMenu = vi.fn();
    const onMessageMember = vi.fn();
    const onWatchStream = vi.fn();
    renderSidebar({
      onOpenProfile,
      onOpenUserContextMenu,
      onMessageMember,
      onWatchStream,
      memberVoiceActivities: [
        {
          userId: mira.id,
          channelId: "game-1",
          channelName: "Game #1",
          isStreaming: true,
        },
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "Show all" }));
    const profileButtons = screen.getAllByRole("button", {
      name: "View Mira's profile",
    });
    const overlayProfile = profileButtons.at(-1)!;
    fireEvent.contextMenu(overlayProfile, { clientX: 10, clientY: 20 });
    expect(onOpenUserContextMenu).toHaveBeenCalled();
    await userEvent.click(overlayProfile);
    expect(onOpenProfile).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Message Mira" }));
    expect(onMessageMember).toHaveBeenCalledWith(mira);

    await userEvent.click(screen.getByRole("button", { name: "Show all" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Watch Mira's stream" }),
    );
    expect(onWatchStream).toHaveBeenCalledWith(mira, channels[4]);
  });

  it("offers compact admin creation and ordinary rename while protecting Welcome", async () => {
    const onCreateChannel = vi.fn<(kind: Channel["kind"]) => void>();
    const onRenameChannel = vi.fn();
    renderSidebar({
      canManageChannels: true,
      onCreateChannel,
      onRenameChannel,
    });
    const addChannel = screen.getByRole("button", { name: "Add channel" });
    expect(addChannel).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(addChannel);
    expect(screen.getByRole("menu", { name: "Add channel" })).toBeVisible();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Text channel" }),
    );
    await userEvent.click(addChannel);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Voice channel" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Rename Chat" }));
    expect(onCreateChannel.mock.calls.map(([kind]) => kind)).toEqual([
      "text",
      "voice",
    ]);
    expect(onRenameChannel).toHaveBeenCalledWith(channels[1]);
    expect(screen.queryByRole("button", { name: "Rename Welcome" })).toBeNull();
  });

  it("closes the add-channel menu with Escape and returns focus to the plus", async () => {
    renderSidebar({ canManageChannels: true });
    const addChannel = screen.getByRole("button", { name: "Add channel" });
    await userEvent.click(addChannel);
    expect(screen.getByRole("menu", { name: "Add channel" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Add channel" })).toBeNull();
    expect(addChannel).toHaveFocus();
  });

  it("keeps the room timer in its dedicated trailing slot", () => {
    const joinedAt = new Date(Date.now() - 9 * 60_000 - 44_000).toISOString();
    renderSidebar({
      voiceOccupants: [
        {
          userId: mira.id,
          displayName: mira.displayName,
          avatarUrl: mira.avatarUrl,
          channelId: "game-1",
          joinedAt,
          isStreaming: false,
        },
      ],
    });

    const row = screen.getByText("Game #1").closest("button")!;
    const duration = row.querySelector(".channel-voice-duration");
    expect(duration).not.toBeNull();
    expect(duration?.querySelector("time")).toHaveAttribute(
      "dateTime",
      joinedAt,
    );
  });

  it("keeps active-call and current-user controls pinned in the footer", () => {
    renderSidebar({
      voice: {
        status: "connected",
        connectionQuality: "good",
        channel: channels[4],
        cameraEnabled: false,
        cameraPending: false,
        screenShareEnabled: false,
        screenSharePending: false,
        screenShareAvailable: true,
        leave: vi.fn().mockResolvedValue(undefined),
        toggleCamera: vi.fn().mockResolvedValue(undefined),
        stopScreenShare: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof useVoiceRoom>,
    });
    expect(document.querySelector(".sidebar-voice-panel")).not.toBeNull();
    expect(document.querySelector(".user-dock")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Turn camera on" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open soundboard" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible();
  });
});

function room(
  id: string,
  name: string,
  kind: Channel["kind"],
  position: number,
  purpose: Channel["purpose"] = "chat",
): Channel {
  return {
    id,
    serverId: server.id,
    categoryId: "category-channels",
    name,
    kind,
    purpose,
    position,
    topic: "Friends only",
  };
}

function member(
  id: string,
  displayName: string,
  status: ServerMember["status"],
  role: ServerMember["role"] = "member",
): ServerMember {
  return {
    ...user,
    id,
    displayName,
    email: `${id}@example.test`,
    status,
    role,
  };
}
