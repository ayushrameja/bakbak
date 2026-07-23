import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { mockMessages, mockWorkspace } from "./mock-data";
import type { DirectConversation } from "./types";
import {
  BakbakCache,
  MAX_CACHED_MESSAGES_PER_THREAD,
  mergeMessages,
  normalizeMessagesForCache,
  normalizeWorkspaceForCache,
} from "./local-cache";

const userId = mockWorkspace.members[0]?.id ?? "current-user";

describe("BakbakCache", () => {
  it("isolates account state and normalizes transient workspace fields", async () => {
    const cache = new BakbakCache(new IDBFactory());
    const workspace = {
      ...mockWorkspace,
      members: mockWorkspace.members.map((member, index) => ({
        ...member,
        avatarUrl: index === 0 ? "blob:private-avatar" : member.avatarUrl,
        status: "online" as const,
      })),
    };

    await cache.writeAccountState({
      userId,
      workspace,
      directConversations: [],
      lastDestination: { kind: "channel", id: workspace.channels[0]!.id },
    });

    const restored = await cache.readAccountState(userId);
    expect(restored?.workspace?.members[0]).toMatchObject({
      avatarUrl: null,
      status: "offline",
    });
    await expect(cache.readAccountState("someone-else")).resolves.toBeNull();
  });

  it("retains only confirmed newest messages and merges by stable ID", async () => {
    const cache = new BakbakCache(new IDBFactory());
    const channelId = mockWorkspace.channels[0]!.id;
    const messages = Array.from(
      { length: MAX_CACHED_MESSAGES_PER_THREAD + 5 },
      (_, index) => ({
        id: `message-${String(index).padStart(3, "0")}`,
        channelId,
        authorId: userId,
        body: `${index}`,
        content: null,
        createdAt: new Date(1_700_000_000_000 + index).toISOString(),
        pending: index === MAX_CACHED_MESSAGES_PER_THREAD + 4,
      }),
    );

    await cache.writeThread(userId, "channel", channelId, messages);
    const restored = await cache.readThread(userId, "channel", channelId);

    expect(restored).toHaveLength(MAX_CACHED_MESSAGES_PER_THREAD);
    expect(restored[0]?.id).toBe("message-004");
    expect(restored.at(-1)?.id).toBe("message-203");
    expect(
      normalizeMessagesForCache(messages).some((item) => item.pending),
    ).toBe(false);
    expect(
      mergeMessages(
        mockMessages,
        mockMessages.map((message) => ({ ...message, body: "new body" })),
      )[0]?.body,
    ).toBe("new body");
  });

  it("stores profile blobs, prunes least-recently-used media, and reports stats", async () => {
    const cache = new BakbakCache(new IDBFactory(), 7);
    await cache.writeProfileMedia(userId, "avatars", "old", new Blob(["1234"]));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await cache.writeProfileMedia(userId, "avatars", "new", new Blob(["5678"]));

    await expect(
      cache.readProfileMedia(userId, "avatars", "old"),
    ).resolves.toBeNull();
    await expect(
      cache.readProfileMedia(userId, "avatars", "new"),
    ).resolves.not.toBeNull();
    expect(await cache.stats(userId)).toMatchObject({
      profileMediaBytes: 4,
      profileMediaCount: 1,
    });
  });

  it("keeps only authenticated posters in the bounded rich-media LRU", async () => {
    const cache = new BakbakCache(new IDBFactory(), 256, 7);
    await cache.writeMessageMedia(
      userId,
      "message-media",
      "old-poster",
      new Blob(["1234"]),
    );
    await new Promise((resolve) => setTimeout(resolve, 2));
    await cache.writeMessageMedia(
      userId,
      "message-stickers",
      "new-poster",
      new Blob(["5678"]),
    );

    await expect(
      cache.readMessageMedia(userId, "message-media", "old-poster"),
    ).resolves.toBeNull();
    await expect(
      cache.readMessageMedia(userId, "message-stickers", "new-poster"),
    ).resolves.not.toBeNull();
    expect(await cache.stats(userId)).toMatchObject({
      messageMediaBytes: 4,
      messageMediaCount: 1,
    });
  });

  it("strips transient full-media URLs while retaining rich metadata", () => {
    const normalized = normalizeMessagesForCache([
      {
        ...mockMessages[0]!,
        attachments: [
          {
            id: "attachment",
            kind: "video" as const,
            mimeType: "video/mp4",
            byteSize: 123,
            width: 640,
            height: 360,
            durationMs: 2_000,
            objectPath: "private/original.mp4",
            posterPath: "private/poster.webp",
            objectUrl: "blob:original",
            posterUrl: "blob:poster",
          },
        ],
      },
    ]);
    expect(normalized[0]?.attachments?.[0]).not.toHaveProperty("objectUrl");
    expect(normalized[0]?.attachments?.[0]).not.toHaveProperty("posterUrl");
    expect(normalized[0]?.attachments?.[0]?.posterPath).toBe(
      "private/poster.webp",
    );
  });

  it("clears only the requested account", async () => {
    const cache = new BakbakCache(new IDBFactory());
    const conversation = {
      id: "dm",
      otherMember: mockWorkspace.members[1]!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      latestMessageId: null,
      latestMessageAuthorId: null,
      latestMessageBody: null,
      latestMessageCreatedAt: null,
      hasUnread: false,
    } satisfies DirectConversation;
    for (const id of [userId, "other-user"]) {
      await cache.writeAccountState({
        userId: id,
        workspace: normalizeWorkspaceForCache(mockWorkspace),
        directConversations: [conversation],
        lastDestination: null,
      });
      await cache.writeThread(id, "direct", "dm", []);
    }

    await cache.clearAccount(userId);

    await expect(cache.readAccountState(userId)).resolves.toBeNull();
    await expect(cache.readAccountState("other-user")).resolves.not.toBeNull();
  });

  it("purges profile media that is no longer authorized by live metadata", async () => {
    const cache = new BakbakCache(new IDBFactory());
    await cache.writeProfileMedia(
      userId,
      "avatars",
      "keep",
      new Blob(["keep"]),
    );
    await cache.writeProfileMedia(
      userId,
      "profile-covers",
      "remove",
      new Blob(["remove"]),
    );

    await cache.retainProfileMedia(userId, [
      { bucket: "avatars", path: "keep" },
    ]);

    await expect(
      cache.readProfileMedia(userId, "avatars", "keep"),
    ).resolves.not.toBeNull();
    await expect(
      cache.readProfileMedia(userId, "profile-covers", "remove"),
    ).resolves.toBeNull();
  });
});
