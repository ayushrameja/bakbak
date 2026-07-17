import { describe, expect, it } from "vitest";
import type { MessageDraft, ServerMember } from "../../lib/types";
import {
  draftToSegments,
  findMentionQuery,
  insertMention,
  updateDraftText,
} from "./message-content";

const member: ServerMember = {
  id: "user-mira",
  displayName: "Mira",
  email: "",
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

describe("structured message drafts", () => {
  it("inserts stable mentions and serializes surrounding text", () => {
    const draft = insertMention(
      { text: "hello @mi there", mentions: [] },
      member,
      6,
      9,
    );
    expect(draft).toEqual({
      text: "hello @Mira there",
      mentions: [
        {
          userId: member.id,
          fallback: "Mira",
          start: 6,
          end: 11,
        },
      ],
    });
    expect(draftToSegments(draft)).toEqual([
      { type: "text", text: "hello " },
      { type: "mention", userId: member.id, fallback: "Mira" },
      { type: "text", text: " there" },
    ]);
  });

  it("demotes a mention to plain text when edited through", () => {
    const draft: MessageDraft = {
      text: "hello @Mira",
      mentions: [
        {
          userId: member.id,
          fallback: "Mira",
          start: 6,
          end: 11,
        },
      ],
    };
    expect(updateDraftText(draft, "hello @Mra").mentions).toEqual([]);
  });

  it("keeps unaffected mention ranges aligned after earlier edits", () => {
    const draft: MessageDraft = {
      text: "hi @Mira",
      mentions: [
        {
          userId: member.id,
          fallback: "Mira",
          start: 3,
          end: 8,
        },
      ],
    };
    expect(updateDraftText(draft, "hello hi @Mira").mentions[0]).toMatchObject({
      start: 9,
      end: 14,
    });
  });

  it("finds only the active at-query at the caret", () => {
    expect(findMentionQuery("hello @mi", 9)).toEqual({
      query: "mi",
      start: 6,
      end: 9,
    });
    expect(findMentionQuery("email@example.test", 18)).toBeNull();
  });
});
