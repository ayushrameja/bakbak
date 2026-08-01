import { describe, expect, it } from "vitest";
import type { VoicePresenceSession } from "../../lib/presence-service";
import type { ServerMember } from "../../lib/types";
import {
  compareVoiceRoomOccupants,
  selectVoiceRoomOccupants,
} from "./voice-occupancy";

const joinedAt = "2026-07-30T12:00:00.000Z";

function member(id: string, displayName: string): ServerMember {
  return {
    id,
    displayName,
    email: `${id}@example.test`,
    avatarUrl: null,
    avatarAnimationUrl: null,
    avatarPath: null,
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
    status: "online",
    role: "member",
  };
}

function heartbeat(
  userId: string,
  channelId: string,
  isStreaming = false,
): VoicePresenceSession {
  return { userId, channelId, joinedAt, isStreaming };
}

describe("voice occupancy selection", () => {
  it("replaces the active heartbeat room with the exact LiveKit roster", () => {
    const occupants = selectVoiceRoomOccupants({
      members: [
        member("self", "Ayu"),
        member("connected", "Mira"),
        member("ghost", "Ghost"),
      ],
      heartbeatSessions: [
        heartbeat("self", "voice-active"),
        heartbeat("ghost", "voice-active"),
      ],
      activeRoom: {
        channelId: "voice-active",
        participants: [
          { userId: "self", joinedAt },
          { userId: "connected", joinedAt: null },
        ],
        streamingUserIds: new Set(["connected"]),
      },
    });

    expect(occupants.map((occupant) => occupant.userId)).toEqual([
      "self",
      "connected",
    ]);
    expect(
      occupants.find((occupant) => occupant.userId === "connected"),
    ).toEqual(
      expect.objectContaining({
        channelId: "voice-active",
        isStreaming: true,
      }),
    );
  });

  it("keeps other-room heartbeats and lets an active participant override its stale room", () => {
    const occupants = selectVoiceRoomOccupants({
      members: [
        member("self", "Ayu"),
        member("active", "Bik"),
        member("other", "Mira"),
      ],
      heartbeatSessions: [
        heartbeat("active", "voice-other"),
        heartbeat("other", "voice-other", true),
      ],
      activeRoom: {
        channelId: "voice-active",
        participants: [
          { userId: "self", joinedAt },
          { userId: "active", joinedAt },
        ],
        streamingUserIds: new Set(),
      },
    });

    expect(
      occupants.map(({ userId, channelId }) => ({ userId, channelId })),
    ).toEqual([
      { userId: "self", channelId: "voice-active" },
      { userId: "active", channelId: "voice-active" },
      { userId: "other", channelId: "voice-other" },
    ]);
  });

  it("resolves current member profiles, drops outsiders, and deduplicates by user ID", () => {
    const occupants = selectVoiceRoomOccupants({
      members: [member("known", "Current profile")],
      heartbeatSessions: [
        heartbeat("known", "voice-2"),
        heartbeat("known", "voice-2"),
        heartbeat("outsider", "voice-2"),
      ],
      activeRoom: null,
    });

    expect(occupants).toEqual([
      expect.objectContaining({
        userId: "known",
        displayName: "Current profile",
      }),
    ]);
  });

  it("sorts normalized names and uses stable user IDs as the tie-breaker", () => {
    const members = [
      member("user-z", "Zed"),
      member("user-b", "Ｍira"),
      member("user-a", " mira "),
      member("user-c", "Amy"),
    ];
    const sessions = [
      heartbeat("user-z", "voice-1"),
      heartbeat("user-b", "voice-1"),
      heartbeat("user-a", "voice-1"),
      heartbeat("user-c", "voice-1"),
    ];

    const first = selectVoiceRoomOccupants({
      members,
      heartbeatSessions: sessions,
      activeRoom: null,
    });
    const refreshed = selectVoiceRoomOccupants({
      members: [...members].reverse(),
      heartbeatSessions: [...sessions].reverse(),
      activeRoom: null,
    });

    expect(first.map((occupant) => occupant.userId)).toEqual([
      "user-c",
      "user-a",
      "user-b",
      "user-z",
    ]);
    expect(refreshed).toEqual(first);
    expect([...first].sort(compareVoiceRoomOccupants)).toEqual(first);
  });

  it("uses the retained active roster while the caller is reconnecting", () => {
    const retainedRoster = {
      channelId: "voice-active",
      participants: [
        { userId: "self", joinedAt },
        { userId: "friend", joinedAt },
      ],
      streamingUserIds: new Set<string>(),
    };
    const occupants = selectVoiceRoomOccupants({
      members: [member("self", "Ayu"), member("friend", "Mira")],
      heartbeatSessions: [],
      activeRoom: retainedRoster,
    });

    expect(occupants.map((occupant) => occupant.userId)).toEqual([
      "self",
      "friend",
    ]);
  });
});
