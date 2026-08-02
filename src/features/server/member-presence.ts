import type { ServerMember } from "../../lib/types";
import type { MemberVoiceActivity } from "./MemberPanel";

export function selectActivityPreview(
  members: readonly ServerMember[],
  voiceActivities: ReadonlyArray<MemberVoiceActivity>,
  currentUserId: string,
  limit = 6,
): ServerMember[] {
  const inVoice = new Set(voiceActivities.map((activity) => activity.userId));
  return members
    .filter((member) => member.id !== currentUserId)
    .sort((left, right) => {
      const voiceOrder =
        Number(inVoice.has(right.id)) - Number(inVoice.has(left.id));
      const statusOrder = statusRank(left.status) - statusRank(right.status);
      return (
        voiceOrder ||
        statusOrder ||
        left.displayName.localeCompare(right.displayName, undefined, {
          sensitivity: "base",
        }) ||
        left.id.localeCompare(right.id)
      );
    })
    .slice(0, limit);
}

function statusRank(status: ServerMember["status"]): number {
  if (status === "online") return 0;
  if (status === "idle") return 1;
  return 2;
}
