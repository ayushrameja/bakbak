import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "./types";
import { shouldRequestLinkPreview, tokenizeMessageText } from "./link-preview";

describe("message links", () => {
  it("normalizes www links and keeps sentence punctuation outside anchors", () => {
    expect(
      tokenizeMessageText(
        "Docs: www.example.com/guide, then https://example.com/a_(b).",
      ),
    ).toEqual([
      { type: "text", text: "Docs: " },
      {
        type: "link",
        text: "www.example.com/guide",
        url: "https://www.example.com/guide",
      },
      { type: "text", text: ", then " },
      {
        type: "link",
        text: "https://example.com/a_(b)",
        url: "https://example.com/a_(b)",
      },
      { type: "text", text: "." },
    ]);
  });

  it("does not turn executable schemes into links", () => {
    expect(tokenizeMessageText("javascript:alert(1)")).toEqual([
      { type: "text", text: "javascript:alert(1)" },
    ]);
  });

  it("requests only eligible member messages and honors the retry window", () => {
    const message: ConversationMessage = {
      id: "message-1",
      authorId: "user-1",
      body: "https://example.com",
      content: null,
      createdAt: "2026-07-24T12:00:00.000Z",
    };
    expect(shouldRequestLinkPreview(message, new Set(), 1_000)).toBe(true);
    expect(
      shouldRequestLinkPreview(
        {
          ...message,
          linkPreviewAttemptedAt: new Date(500).toISOString(),
        },
        new Set(),
        1_000,
      ),
    ).toBe(false);
    expect(
      shouldRequestLinkPreview(
        { ...message, messageKind: "system" },
        new Set(),
        1_000,
      ),
    ).toBe(false);
    expect(
      shouldRequestLinkPreview(message, new Set([message.id]), 1_000),
    ).toBe(false);
  });
});
