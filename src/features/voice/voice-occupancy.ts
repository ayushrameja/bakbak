import type { VoicePresenceSession } from "../../lib/presence-service";
import type { ServerMember, VoiceRoomOccupant } from "../../lib/types";

export interface ActiveVoiceRosterParticipant {
  userId: string;
  joinedAt: string | null;
}

export interface ActiveVoiceRoomRoster {
  channelId: string;
  participants: ReadonlyArray<ActiveVoiceRosterParticipant>;
  streamingUserIds: ReadonlySet<string>;
}

interface VoiceOccupancyInput {
  members: ReadonlyArray<ServerMember>;
  heartbeatSessions: ReadonlyArray<VoicePresenceSession>;
  activeRoom: ActiveVoiceRoomRoster | null;
}

export function selectVoiceRoomOccupants({
  members,
  heartbeatSessions,
  activeRoom,
}: VoiceOccupancyInput): VoiceRoomOccupant[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const activeUserIds = new Set(
    activeRoom?.participants.map((participant) => participant.userId) ?? [],
  );
  const activeHeartbeatsByUserId = new Map<string, VoicePresenceSession>();
  [...heartbeatSessions]
    .filter((session) => session.channelId === activeRoom?.channelId)
    .sort(compareHeartbeatSessions)
    .forEach((session) => {
      if (!activeHeartbeatsByUserId.has(session.userId)) {
        activeHeartbeatsByUserId.set(session.userId, session);
      }
    });
  const occupantsByUserId = new Map<string, VoiceRoomOccupant>();

  [...heartbeatSessions].sort(compareHeartbeatSessions).forEach((session) => {
    const member = membersById.get(session.userId);
    if (!member) return;
    if (
      activeRoom &&
      (session.channelId === activeRoom.channelId ||
        activeUserIds.has(session.userId))
    ) {
      return;
    }
    if (occupantsByUserId.has(session.userId)) return;
    occupantsByUserId.set(
      session.userId,
      occupantFromMember(member, {
        channelId: session.channelId,
        joinedAt: session.joinedAt,
        isStreaming: session.isStreaming,
      }),
    );
  });

  activeRoom?.participants.forEach((participant) => {
    const member = membersById.get(participant.userId);
    if (!member) return;
    occupantsByUserId.set(
      participant.userId,
      occupantFromMember(member, {
        channelId: activeRoom.channelId,
        joinedAt:
          participant.joinedAt ??
          activeHeartbeatsByUserId.get(participant.userId)?.joinedAt ??
          null,
        isStreaming: activeRoom.streamingUserIds.has(participant.userId),
      }),
    );
  });

  return [...occupantsByUserId.values()].sort(compareVoiceRoomOccupants);
}

export function compareVoiceRoomOccupants(
  left: VoiceRoomOccupant,
  right: VoiceRoomOccupant,
): number {
  const channelOrder = compareStableText(left.channelId, right.channelId);
  if (channelOrder !== 0) return channelOrder;
  const nameOrder = compareStableText(
    normalizeVoiceOccupantName(left.displayName),
    normalizeVoiceOccupantName(right.displayName),
  );
  return nameOrder || compareStableText(left.userId, right.userId);
}

export function normalizeVoiceOccupantName(displayName: string): string {
  return displayName.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function occupantFromMember(
  member: ServerMember,
  voice: Pick<VoiceRoomOccupant, "channelId" | "joinedAt" | "isStreaming">,
): VoiceRoomOccupant {
  return {
    userId: member.id,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    ...voice,
  };
}

function compareHeartbeatSessions(
  left: VoicePresenceSession,
  right: VoicePresenceSession,
): number {
  return (
    compareStableText(left.channelId, right.channelId) ||
    compareStableText(left.userId, right.userId) ||
    compareStableText(left.joinedAt, right.joinedAt)
  );
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
