import { AVATAR_BUCKET } from "../../lib/profile-service";
import { hydrateGiphyAvatarPosters } from "../../lib/profile-giphy-media";
import type { DirectConversation, ServerMember } from "../../lib/types";

type LoadAvatar = (
  bucket: typeof AVATAR_BUCKET,
  path: string | null,
) => Promise<string | null>;

export async function hydrateDirectConversationAvatars(
  conversations: DirectConversation[],
  members: ServerMember[],
  loadAvatar: LoadAvatar,
): Promise<DirectConversation[]> {
  const memberById = new Map(members.map((member) => [member.id, member]));

  const localHydrated = await Promise.all(
    conversations.map(async (conversation) => {
      const member = conversation.otherMember;
      const workspaceMember = memberById.get(member.id);
      const knownAvatarUrl =
        member.avatarUrl ??
        (workspaceMember?.avatarPath === member.avatarPath &&
        workspaceMember.avatarGiphyId === member.avatarGiphyId
          ? workspaceMember.avatarUrl
          : null);

      if (knownAvatarUrl) {
        if (knownAvatarUrl === member.avatarUrl) return conversation;
        return {
          ...conversation,
          otherMember: {
            ...member,
            avatarUrl: knownAvatarUrl,
          },
        };
      }
      if (!member.avatarPath || member.avatarGiphyId) return conversation;

      try {
        const avatarUrl = await loadAvatar(AVATAR_BUCKET, member.avatarPath);
        if (!avatarUrl) return conversation;
        return {
          ...conversation,
          otherMember: {
            ...member,
            avatarUrl,
          },
        };
      } catch {
        return conversation;
      }
    }),
  );

  if (
    !localHydrated.some(
      (conversation) => conversation.otherMember.avatarGiphyId,
    )
  ) {
    return localHydrated;
  }

  try {
    const hydratedMembers = await hydrateGiphyAvatarPosters(
      localHydrated.map((conversation) => conversation.otherMember),
    );
    return localHydrated.map((conversation, index) => ({
      ...conversation,
      otherMember: hydratedMembers[index] ?? conversation.otherMember,
    }));
  } catch {
    return localHydrated.map((conversation) =>
      conversation.otherMember.avatarGiphyId
        ? {
            ...conversation,
            otherMember: {
              ...conversation.otherMember,
              avatarUrl: null,
              avatarAnimationUrl: null,
            },
          }
        : conversation,
    );
  }
}
