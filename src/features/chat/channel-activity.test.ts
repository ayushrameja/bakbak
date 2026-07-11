import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../lib/types";
import {
  markChannelRead,
  shouldPlayIncomingMessageSound,
  unreadChannelsAfterMessage,
} from "./channel-activity";

const message: ChatMessage = {
  id: "message-1",
  channelId: "random",
  authorId: "friend",
  body: "psst",
  createdAt: "2026-07-11T12:00:00.000Z",
};

describe("channel activity", () => {
  it("marks a background channel unread for a friend's message", () => {
    expect(
      unreadChannelsAfterMessage(new Set(), message, "general", "current"),
    ).toEqual(new Set(["random"]));
  });

  it("does not mark the selected channel or the current user's message unread", () => {
    expect(
      unreadChannelsAfterMessage(new Set(), message, "random", "current"),
    ).toEqual(new Set());
    expect(
      unreadChannelsAfterMessage(
        new Set(),
        { ...message, authorId: "current" },
        "general",
        "current",
      ),
    ).toEqual(new Set());
  });

  it("clears unread state when the channel is opened", () => {
    expect(markChannelRead(new Set(["general", "random"]), "random")).toEqual(
      new Set(["general"]),
    );
  });

  it("plays sounds only for committed messages from another user", () => {
    expect(shouldPlayIncomingMessageSound(message, "current")).toBe(true);
    expect(
      shouldPlayIncomingMessageSound(
        { ...message, authorId: "current" },
        "current",
      ),
    ).toBe(false);
    expect(
      shouldPlayIncomingMessageSound({ ...message, pending: true }, "current"),
    ).toBe(false);
  });
});
