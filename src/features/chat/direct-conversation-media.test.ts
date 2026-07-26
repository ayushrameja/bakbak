import { beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_BUCKET } from "../../lib/profile-service";
import type { DirectConversation, ServerMember } from "../../lib/types";
import { hydrateDirectConversationAvatars } from "./direct-conversation-media";

const giphyState = vi.hoisted(() => ({ hydrate: vi.fn() }));

vi.mock("../../lib/profile-giphy-media", () => ({
  hydrateGiphyAvatarPosters: giphyState.hydrate,
}));

const member: ServerMember = {
  id: "friend-1",
  displayName: "Bhindi",
  email: "",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: "friend-1/avatar-poster.webp",
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
  beforeEach(() => {
    giphyState.hydrate.mockImplementation((members: ServerMember[]) =>
      Promise.resolve(members),
    );
  });

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

  it("hydrates provider-linked posters without calling private storage", async () => {
    const loadAvatar = vi.fn();
    const giphyMember = {
      ...member,
      avatarPath: null,
      avatarGiphyId: "avatar-gif",
    };
    giphyState.hydrate.mockResolvedValue([
      {
        ...giphyMember,
        avatarUrl: "https://media.giphy.com/avatar-still.webp",
      },
    ]);

    const [hydrated] = await hydrateDirectConversationAvatars(
      [{ ...conversation, otherMember: giphyMember }],
      [],
      loadAvatar,
    );

    expect(loadAvatar).not.toHaveBeenCalled();
    expect(hydrated?.otherMember.avatarUrl).toBe(
      "https://media.giphy.com/avatar-still.webp",
    );
  });
});
