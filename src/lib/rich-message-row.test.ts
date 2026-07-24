import { describe, expect, it } from "vitest";
import {
  attachReplyRows,
  CHANNEL_RICH_SELECT,
  DIRECT_RICH_SELECT,
  parseReply,
  type RichMessageRow,
} from "./rich-message-row";

describe("rich message PostgREST selects", () => {
  it("loads scalar parent IDs without a recursive PostgREST embed", () => {
    expect(CHANNEL_RICH_SELECT).toContain("reply_to_id");
    expect(DIRECT_RICH_SELECT).toContain("reply_to_id");
    expect(CHANNEL_RICH_SELECT).not.toContain("reply:messages");
    expect(DIRECT_RICH_SELECT).not.toContain("reply:direct_messages");
  });

  it("hydrates only messages with an explicit parent ID", () => {
    const messages: RichMessageRow[] = [
      {
        id: "plain",
        author_id: "author",
        body: "Plain",
        content: [],
        created_at: "2026-07-23T10:00:00.000Z",
        reply_to_id: null,
      },
      {
        id: "reply",
        author_id: "author",
        body: "Reply",
        content: [],
        created_at: "2026-07-23T10:01:00.000Z",
        reply_to_id: "parent",
      },
    ];
    const [ordinary, reply] = attachReplyRows(messages, [
      {
        id: "parent",
        author_id: "friend",
        body: "Original",
        deleted_at: null,
      },
    ]);

    expect(ordinary?.reply).toBeNull();
    expect(reply?.reply).toMatchObject({ id: "parent", body: "Original" });
  });

  it("ignores reverse-relation arrays instead of inventing a former friend", () => {
    expect(parseReply([] as never)).toBeNull();
  });
});
