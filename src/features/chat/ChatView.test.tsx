import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  AppUser,
  Channel,
  ChatMessage,
  ServerMember,
} from "../../lib/types";
import { ChatView } from "./ChatView";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  status: "online",
};
const member: ServerMember = { ...user, role: "admin" };
const channel: Channel = {
  id: "channel-1",
  serverId: "server-1",
  name: "lobby",
  kind: "text",
  position: 0,
  topic: "Friends only",
};

describe("ChatView controlled drafts", () => {
  it("renders the app-owned channel draft and clears it before sending", async () => {
    const onDraftChange = vi.fn();
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatView
        channel={channel}
        messages={[]}
        members={[member]}
        currentUser={user}
        sending={false}
        draft={{ text: "still writing this", mentions: [] }}
        onDraftChange={onDraftChange}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveValue("still writing this");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onDraftChange).toHaveBeenCalledWith({ text: "", mentions: [] });
    expect(onSend).toHaveBeenCalledWith({
      text: "still writing this",
      mentions: [],
    });
  });

  it("inserts a stable mention and renders its current profile name", async () => {
    const renamedMember: ServerMember = {
      ...member,
      id: "user-2",
      displayName: "New Mira",
    };
    const message: ChatMessage = {
      id: "message-1",
      channelId: channel.id,
      authorId: user.id,
      body: "Hello @Old Mira",
      content: [
        { type: "text", text: "Hello " },
        { type: "mention", userId: renamedMember.id, fallback: "Old Mira" },
      ],
      createdAt: new Date().toISOString(),
    };
    render(
      <ChatView
        channel={channel}
        messages={[message]}
        members={[member, renamedMember]}
        currentUser={user}
        sending={false}
        draft={{ text: "@New", mentions: [] }}
        onDraftChange={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText("@New Mira")).toHaveAttribute(
      "data-user-id",
      renamedMember.id,
    );

    const composer = screen.getByRole("combobox");
    await userEvent.click(composer);
    expect(screen.getByRole("option", { name: /New Mira/ })).toBeVisible();
  });
});
