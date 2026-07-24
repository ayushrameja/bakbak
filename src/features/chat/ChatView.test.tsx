import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  it("renders automation-only System events without a composer or message actions", () => {
    const releases: Channel = {
      ...channel,
      id: "releases",
      name: "releases",
      purpose: "system-releases",
      topic: "Published Bakbak releases and their notes.",
    };
    const message: ChatMessage = {
      id: "release-1",
      channelId: releases.id,
      authorId: null,
      body: "Bakbak v0.16.0 is now available.",
      content: null,
      createdAt: "2026-07-24T12:00:00.000Z",
      messageKind: "system",
      systemEvent: {
        type: "release_published",
        releaseId: 16,
        tag: "v0.16.0",
        name: "Bakbak v0.16.0",
        notes: "System channels have entered the chat.",
        url: "https://github.com/ayushrameja/bakbak/releases/tag/v0.16.0",
        publishedAt: "2026-07-24T12:00:00.000Z",
      },
    };
    const fallback: ChatMessage = {
      id: "release-fallback",
      channelId: releases.id,
      authorId: null,
      body: "Bakbak v0.15.0 is available to install.",
      content: null,
      createdAt: "2026-07-23T12:00:00.000Z",
      messageKind: "system",
      systemEvent: null,
    };

    render(
      <ChatView
        channel={releases}
        messages={[fallback, message]}
        members={[member]}
        currentUser={user}
        sending={false}
        draft={EMPTY_MESSAGE_DRAFT}
        onDraftChange={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
        onDeleteMessage={vi.fn()}
        onReact={vi.fn()}
      />,
    );

    expect(screen.getByText("Automation-only channel")).toBeVisible();
    expect(screen.getByText("Bakbak v0.16.0")).toBeVisible();
    expect(
      screen.getByText("System channels have entered the chat."),
    ).toBeVisible();
    expect(
      screen.getByText("Bakbak v0.15.0 is available to install."),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reply to message" }),
    ).not.toBeInTheDocument();
  });

  it("linkifies safe text and reveals click-to-load YouTube previews", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const message: ChatMessage = {
      id: "message-link",
      channelId: channel.id,
      authorId: user.id,
      body: "Read https://example.com/docs.",
      content: [{ type: "text", text: "Read https://example.com/docs." }],
      createdAt: "2026-07-24T12:00:00.000Z",
      linkPreview: {
        kind: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        videoId: "dQw4w9WgXcQ",
        title: "A deeply important architecture review",
      },
    };
    render(
      <ChatView
        channel={channel}
        messages={[message]}
        members={[member]}
        currentUser={user}
        sending={false}
        draft={EMPTY_MESSAGE_DRAFT}
        onDraftChange={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const link = screen.getByRole("link", {
      name: "https://example.com/docs",
    });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    await userEvent.click(link);
    expect(open).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer",
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: /A deeply important architecture review/i,
      }),
    );
    expect(
      screen.getByTitle("A deeply important architecture review"),
    ).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1",
    );
    open.mockRestore();
  });

  it("presents an empty channel as the first branch of its conversation", () => {
    const { container } = render(
      <ChatView
        channel={channel}
        messages={[]}
        members={[member]}
        currentUser={user}
        sending={false}
        draft={EMPTY_MESSAGE_DRAFT}
        onDraftChange={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(container.querySelector(".conversation-flow--empty")).toBeTruthy();
    expect(screen.getByText("Quiet room")).toBeVisible();
    expect(screen.getByText("#lobby is listening")).toBeVisible();
    expect(
      screen.getByRole("status", {
        name: "This conversation has no messages yet",
      }),
    ).toHaveTextContent("The first branch is yours.");
    expect(
      container.querySelector(".conversation-thread__end"),
    ).not.toBeInTheDocument();
  });

  it("connects populated messages and grouped replies to the conversation trail", () => {
    const messages: ChatMessage[] = [
      {
        id: "message-1",
        channelId: channel.id,
        authorId: user.id,
        body: "First thought",
        content: null,
        createdAt: "2026-07-23T10:00:00.000Z",
      },
      {
        id: "message-2",
        channelId: channel.id,
        authorId: user.id,
        body: "Same thought, continued",
        content: null,
        createdAt: "2026-07-23T10:01:00.000Z",
      },
    ];
    const { container } = render(
      <ChatView
        channel={channel}
        messages={messages}
        members={[member]}
        currentUser={user}
        sending={false}
        draft={EMPTY_MESSAGE_DRAFT}
        onDraftChange={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(container.querySelector(".conversation-flow--filled")).toBeTruthy();
    expect(screen.getByText("Conversation flowing")).toBeVisible();
    expect(container.querySelectorAll("article.message")).toHaveLength(2);
    expect(container.querySelector("#message-message-2")).toHaveClass(
      "message--grouped",
    );
    expect(container.querySelector(".conversation-thread__end")).toBeVisible();
    expect(
      screen.queryByRole("status", {
        name: "This conversation has no messages yet",
      }),
    ).not.toBeInTheDocument();
  });

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
    expect(screen.getByText("Mira is one message away")).toBeVisible();
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

describe("ConversationView scrolling", () => {
  it("opens at the bottom without smooth scrolling and preserves a reader for new messages", () => {
    let scrollHeight = 800;
    const scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("message-list") ? scrollHeight : 0;
      });
    const clientHeightSpy = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("message-list") ? 300 : 0;
      });
    const first = createMessages(2);
    const view = renderChat(first);
    const list = view.container.querySelector<HTMLDivElement>(".message-list");
    if (!list) throw new Error("Expected the message list.");

    expect(list.scrollTop).toBe(800);

    list.scrollTop = 120;
    fireEvent.scroll(list);
    scrollHeight = 920;
    view.rerender(chatElement([...first, createMessage(3)]));

    expect(list.scrollTop).toBe(120);
    expect(screen.getByRole("button", { name: "1 new message" })).toBeVisible();

    view.rerender(
      chatElement([
        { ...first[0]!, body: "Hydrated body without a new row" },
        first[1]!,
        createMessage(3),
      ]),
    );
    expect(list.scrollTop).toBe(120);
    expect(screen.getByRole("button", { name: "1 new message" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "1 new message" }));
    expect(list.scrollTop).toBe(920);
    expect(
      screen.queryByRole("button", { name: /new messages?/i }),
    ).not.toBeInTheDocument();

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });

  it("pins new messages only when the reader is already near the bottom", () => {
    let scrollHeight = 800;
    const scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("message-list") ? scrollHeight : 0;
      });
    const clientHeightSpy = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("message-list") ? 300 : 0;
      });
    const first = createMessages(2);
    const view = renderChat(first);
    const list = view.container.querySelector<HTMLDivElement>(".message-list");
    if (!list) throw new Error("Expected the message list.");

    list.scrollTop = 420;
    fireEvent.scroll(list);
    scrollHeight = 900;
    view.rerender(chatElement([...first, createMessage(3)]));

    expect(list.scrollTop).toBe(900);
    expect(
      screen.queryByRole("button", { name: /new messages?/i }),
    ).not.toBeInTheDocument();

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });

  it("preserves the viewport when older history is prepended", async () => {
    let scrollHeight = 1_000;
    const scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("message-list") ? scrollHeight : 0;
      });
    const clientHeightSpy = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("message-list") ? 300 : 0;
      });
    const messages = createMessages(50, 10);
    const older = [createMessage(8), createMessage(9)];
    const onLoadOlder = vi.fn().mockResolvedValue(older.length);
    const view = render(chatElement(messages, onLoadOlder));
    const list = view.container.querySelector<HTMLDivElement>(".message-list");
    if (!list) throw new Error("Expected the message list.");
    list.scrollTop = 180;
    fireEvent.scroll(list);

    await userEvent.click(
      screen.getByRole("button", { name: "Load older messages" }),
    );
    scrollHeight = 1_140;
    view.rerender(chatElement([...older, ...messages], onLoadOlder));

    expect(list.scrollTop).toBe(320);
    expect(onLoadOlder).toHaveBeenCalledOnce();

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });

  it("disables duplicate history requests while one is pending", async () => {
    let resolveOlder: (count: number) => void = () => undefined;
    const onLoadOlder = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveOlder = resolve;
        }),
    );
    render(chatElement(createMessages(50), onLoadOlder));

    await userEvent.click(
      screen.getByRole("button", { name: "Load older messages" }),
    );
    const pending = screen.getByRole("button", {
      name: "Loading older messages…",
    });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(onLoadOlder).toHaveBeenCalledOnce();

    resolveOlder(0);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Load older messages" }),
      ).toBeEnabled(),
    );
  });

  it("uses the same immediate-bottom behavior for direct conversations", () => {
    const scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(640);
    const clientHeightSpy = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(300);
    const friend: ServerMember = {
      ...member,
      id: "user-2",
      displayName: "Mira",
      role: "member",
    };
    const { container } = render(
      <ConversationView
        target={{ kind: "direct", id: "direct-1", member: friend }}
        messages={createMessages(2)}
        members={[member, friend]}
        currentUser={user}
        sending={false}
        draft={EMPTY_MESSAGE_DRAFT}
        onDraftChange={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      container.querySelector<HTMLDivElement>(".message-list")?.scrollTop,
    ).toBe(640);

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });
});

function renderChat(messages: ChatMessage[]) {
  return render(chatElement(messages));
}

function chatElement(
  messages: ChatMessage[],
  onLoadOlder?: () => Promise<number>,
) {
  return (
    <ChatView
      channel={channel}
      messages={messages}
      members={[member]}
      currentUser={user}
      sending={false}
      draft={EMPTY_MESSAGE_DRAFT}
      onDraftChange={vi.fn()}
      onSend={vi.fn().mockResolvedValue(undefined)}
      {...(onLoadOlder ? { onLoadOlder } : {})}
    />
  );
}

function createMessages(count: number, start = 1): ChatMessage[] {
  return Array.from({ length: count }, (_, index) =>
    createMessage(start + index),
  );
}

function createMessage(index: number): ChatMessage {
  return {
    id: `scroll-message-${index}`,
    channelId: channel.id,
    authorId: user.id,
    body: `Message ${index}`,
    content: null,
    createdAt: new Date(Date.UTC(2026, 6, 24, 10, index)).toISOString(),
  };
}
