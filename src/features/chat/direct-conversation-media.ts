import { AVATAR_BUCKET } from "../../lib/profile-service";
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

  return Promise.all(
    conversations.map(async (conversation) => {
      const member = conversation.otherMember;
      const workspaceMember = memberById.get(member.id);
      const knownAvatarUrl =
        member.avatarUrl ??
        (workspaceMember?.avatarPath === member.avatarPath
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
      if (!member.avatarPath) return conversation;

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
}
