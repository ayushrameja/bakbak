import { describe, expect, it, vi } from "vitest";
import { AVATAR_BUCKET } from "../../lib/profile-service";
import type { DirectConversation, ServerMember } from "../../lib/types";
import { hydrateDirectConversationAvatars } from "./direct-conversation-media";

const member: ServerMember = {
  id: "friend-1",
  displayName: "Bhindi",
  email: "",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: "friend-1/avatar-poster.webp",
  avatarAnimationPath: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "offline",
  role: "member",
};

const conversation: DirectConversation = {
  id: "conversation-1",
  otherMember: member,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  latestMessageId: null,
  latestMessageAuthorId: null,
  latestMessageBody: null,
  latestMessageCreatedAt: null,
  hasUnread: false,
};

describe("hydrateDirectConversationAvatars", () => {
  it("downloads a private poster for direct-message chrome", async () => {
    const loadAvatar = vi.fn().mockResolvedValue("blob:friend-avatar");

    const hydrated = (
      await hydrateDirectConversationAvatars([conversation], [], loadAvatar)
    )[0]!;

    expect(loadAvatar).toHaveBeenCalledWith(AVATAR_BUCKET, member.avatarPath);
    expect(hydrated.otherMember.avatarUrl).toBe("blob:friend-avatar");
  });

  it("reuses an already-downloaded matching workspace avatar", async () => {
    const loadAvatar = vi.fn();
    const hydrated = (
      await hydrateDirectConversationAvatars(
        [conversation],
        [{ ...member, avatarUrl: "blob:workspace-avatar" }],
        loadAvatar,
      )
    )[0]!;

    expect(loadAvatar).not.toHaveBeenCalled();
    expect(hydrated.otherMember.avatarUrl).toBe("blob:workspace-avatar");
  });

  it("keeps the conversation usable when avatar download fails", async () => {
    const loadAvatar = vi.fn().mockRejectedValue(new Error("storage offline"));

    const [hydrated] = await hydrateDirectConversationAvatars(
      [conversation],
      [],
      loadAvatar,
    );

    expect(hydrated).toBe(conversation);
  });
});
