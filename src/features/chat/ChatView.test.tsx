import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  AppUser,
  Channel,
  ChatMessage,
  MessageDraft,
  ServerMember,
} from "../../lib/types";
import { ChatView, ConversationView } from "./ChatView";
import { EMPTY_MESSAGE_DRAFT } from "./message-content";

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
const member: ServerMember = { ...user, role: "admin" };
const channel: Channel = {
  id: "channel-1",
  serverId: "server-1",
  categoryId: null,
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
    expect(onDraftChange).toHaveBeenCalledWith(EMPTY_MESSAGE_DRAFT);
    expect(onSend).toHaveBeenCalledWith({
      text: "still writing this",
      mentions: [],
    });
  });

  it("inserts a stable mention and renders its current profile name", async () => {
    const onOpenProfile = vi.fn();
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
        onOpenProfile={onOpenProfile}
      />,
    );
    expect(screen.getByText("@New Mira")).toHaveAttribute(
      "data-user-id",
      renamedMember.id,
    );
    const authorAvatar = screen.getByRole("button", {
      name: "View Ayu's profile",
    });
    await userEvent.click(authorAvatar);
    expect(onOpenProfile).toHaveBeenLastCalledWith(member, authorAvatar);

    await userEvent.click(screen.getByText("@New Mira"));
    expect(onOpenProfile).toHaveBeenLastCalledWith(
      renamedMember,
      expect.any(HTMLElement),
    );

    const composer = screen.getByRole("combobox");
    await userEvent.click(composer);
    expect(screen.getByRole("option", { name: /New Mira/ })).toBeVisible();
  });

  it("renders a direct target and restores its draft after send failure", async () => {
    const friend: ServerMember = {
      ...member,
      id: "user-2",
      displayName: "Mira",
      role: "member",
    };
    const onDraftChange = vi.fn();
    const onSend = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <ConversationView
        target={{ kind: "direct", id: "direct-1", member: friend }}
        messages={[]}
        members={[member, friend]}
        currentUser={user}
        sending={false}
        draft={{ text: "private thought", mentions: [] }}
        onDraftChange={onDraftChange}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Message Mira" })).toHaveValue(
      "private thought",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onDraftChange.mock.calls).toEqual([
      [EMPTY_MESSAGE_DRAFT],
      [{ text: "private thought", mentions: [] }],
    ]);
  });

  it("opens the emoji picker and inserts an emoji at the text cursor", async () => {
    const onDraftChange = vi.fn();
    render(
      <ChatView
        channel={channel}
        messages={[]}
        members={[member]}
        currentUser={user}
        sending={false}
        draft={{ text: "Hello  there", mentions: [] }}
        onDraftChange={onDraftChange}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const composer = screen.getByRole("combobox");
    if (!(composer instanceof HTMLInputElement)) {
      throw new Error("Expected the composer to be an input.");
    }
    composer.setSelectionRange(6, 6);
    await userEvent.click(
      screen.getByRole("button", { name: "Open emoji picker" }),
    );
    expect(screen.getByRole("dialog", { name: "Emoji picker" })).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Add Grinning face" }),
    );

    expect(onDraftChange).toHaveBeenLastCalledWith({
      text: "Hello 😀 there",
      mentions: [],
    });
    expect(
      screen.queryByRole("dialog", { name: "Emoji picker" }),
    ).not.toBeInTheDocument();
  });

  it("offers reply, sticker reaction, and author deletion actions", async () => {
    const friend: ServerMember = {
      ...member,
      id: "user-2",
      displayName: "Mira",
      role: "member",
    };
    const onDraftChange = vi.fn();
    const onReact = vi.fn().mockResolvedValue(undefined);
    const onDeleteMessage = vi.fn().mockResolvedValue(undefined);
    const sticker = {
      id: "sticker-1",
      serverId: channel.serverId,
      label: "Wave",
      posterPath: "wave.webp",
      animationPath: null,
      width: 128,
      height: 128,
      createdBy: user.id,
      enabled: true,
      createdAt: new Date().toISOString(),
      posterUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    };
    render(
      <ChatView
        channel={channel}
        messages={[
          {
            id: "friend-message",
            channelId: channel.id,
            authorId: friend.id,
            body: "A reply-worthy thought",
            content: null,
            createdAt: "2026-07-23T10:00:00.000Z",
          },
          {
            id: "own-message",
            channelId: channel.id,
            authorId: user.id,
            body: "My message",
            content: null,
            createdAt: "2026-07-23T10:01:00.000Z",
          },
        ]}
        members={[member, friend]}
        currentUser={user}
        sending={false}
        draft={EMPTY_MESSAGE_DRAFT}
        onDraftChange={onDraftChange}
        onSend={vi.fn().mockResolvedValue(undefined)}
        stickers={[sticker]}
        onReact={onReact}
        onDeleteMessage={onDeleteMessage}
      />,
    );

    await userEvent.click(
      screen.getAllByRole("button", { name: "Reply to message" })[0]!,
    );
    const replyDraft = onDraftChange.mock.lastCall?.[0] as
      MessageDraft | undefined;
    expect(replyDraft?.notifyReplyAuthor).toBe(true);
    expect(replyDraft?.replyTo).toMatchObject({
      id: "friend-message",
      authorId: friend.id,
    });

    await userEvent.click(
      screen.getAllByRole("button", { name: "React with a sticker" })[0]!,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "React with Wave" }),
    );
    expect(onReact).toHaveBeenCalledWith("friend-message", sticker.id);

    await userEvent.click(
      screen.getByRole("button", { name: "Delete message" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Delete message?" });
    expect(dialog).toBeVisible();
    expect(onDeleteMessage).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    expect(onDeleteMessage).toHaveBeenCalledWith("own-message");
  });
});
