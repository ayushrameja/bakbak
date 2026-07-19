import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  presenceSnapshotFromHeartbeats,
  PRESENCE_EXPIRY_MS,
  subscribeToServerPresence,
} from "./presence-service";

const presenceState = vi.hoisted(() => {
  const query = {
    eq: vi.fn(),
    returns: vi.fn(),
  };
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  return {
    authGetSession: vi.fn(),
    channel,
    channelFactory: vi.fn(),
    from: vi.fn(),
    query,
    realtimeSetAuth: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
    select: vi.fn(),
  };
});

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: presenceState.authGetSession },
    channel: presenceState.channelFactory,
    from: presenceState.from,
    realtime: { setAuth: presenceState.realtimeSetAuth },
    removeChannel: presenceState.removeChannel,
    rpc: presenceState.rpc,
  }),
}));

describe("server presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    presenceState.authGetSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
      error: null,
    });
    presenceState.realtimeSetAuth.mockResolvedValue(undefined);
    presenceState.rpc.mockResolvedValue({
      data: new Date().toISOString(),
      error: null,
    });
    presenceState.channel.on.mockReturnValue(presenceState.channel);
    presenceState.channel.subscribe.mockReturnValue(presenceState.channel);
    presenceState.channelFactory.mockReturnValue(presenceState.channel);
    presenceState.from.mockReturnValue({ select: presenceState.select });
    presenceState.select.mockReturnValue(presenceState.query);
    presenceState.query.eq.mockReturnValue(presenceState.query);
    presenceState.query.returns.mockResolvedValue({
      data: [
        {
          user_id: "user-1",
          last_seen_at: new Date().toISOString(),
          voice_channel_id: null,
          voice_joined_at: null,
          is_streaming: false,
        },
        {
          user_id: "user-2",
          last_seen_at: new Date().toISOString(),
          voice_channel_id: "voice-1",
          voice_joined_at: "2026-07-11T12:00:00.000Z",
          is_streaming: true,
        },
      ],
      error: null,
    });
  });

  it("keeps fresh heartbeats and expires stale users", () => {
    const now = Date.now();
    const snapshot = presenceSnapshotFromHeartbeats(
      [
        {
          user_id: "fresh",
          last_seen_at: new Date(now - 1000).toISOString(),
          voice_channel_id: "voice-1",
          voice_joined_at: new Date(now - 5000).toISOString(),
          is_streaming: true,
        },
        {
          user_id: "stale",
          last_seen_at: new Date(now - PRESENCE_EXPIRY_MS - 1).toISOString(),
          voice_channel_id: "voice-1",
          voice_joined_at: new Date(now - 60_000).toISOString(),
          is_streaming: false,
        },
      ],
      now,
    );
    expect([...snapshot.onlineUserIds]).toEqual(["fresh"]);
    expect(snapshot.voiceSessions).toEqual([
      expect.objectContaining({ userId: "fresh", channelId: "voice-1" }),
    ]);
  });

  it("authenticates, publishes a heartbeat, syncs rows, and cleans up", async () => {
    const onSync = vi.fn();
    const subscription = subscribeToServerPresence({
      serverId: "server-1",
      userId: "user-1",
      onSync,
    });

    await vi.waitFor(() =>
      expect(presenceState.realtimeSetAuth).toHaveBeenCalledWith(
        "session-token",
      ),
    );
    await vi.waitFor(() =>
      expect(presenceState.rpc).toHaveBeenCalledWith("heartbeat_presence_v3", {
        p_server_id: "server-1",
        p_voice_channel_id: null,
        p_is_streaming: false,
      }),
    );
    await vi.waitFor(() =>
      expect(onSync).toHaveBeenCalledWith({
        onlineUserIds: new Set(["user-1", "user-2"]),
        voiceSessions: [
          {
            userId: "user-2",
            channelId: "voice-1",
            joinedAt: "2026-07-11T12:00:00.000Z",
            isStreaming: true,
          },
        ],
      }),
    );

    expect(presenceState.channelFactory).toHaveBeenCalledWith(
      "presence-heartbeats:server-1",
    );
    expect(presenceState.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        table: "presence_heartbeats",
        filter: "server_id=eq.server-1",
      }),
      expect.any(Function),
    );

    await subscription.setVoiceState("voice-2", true);
    await vi.waitFor(() =>
      expect(presenceState.rpc).toHaveBeenLastCalledWith(
        "heartbeat_presence_v3",
        {
          p_server_id: "server-1",
          p_voice_channel_id: "voice-2",
          p_is_streaming: true,
        },
      ),
    );

    subscription.stop();
    expect(presenceState.removeChannel).toHaveBeenCalledWith(
      presenceState.channel,
    );
  });

  it("falls back to legacy heartbeat writes and reads before migration deployment", async () => {
    presenceState.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "function was not found" },
      })
      .mockResolvedValue({ data: new Date().toISOString(), error: null });
    presenceState.query.returns
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42703", message: "is_streaming does not exist" },
      })
      .mockResolvedValue({
        data: [
          {
            user_id: "user-2",
            last_seen_at: new Date().toISOString(),
            voice_channel_id: "voice-1",
            voice_joined_at: "2026-07-11T12:00:00.000Z",
          },
        ],
        error: null,
      });
    const onError = vi.fn();
    const onSync = vi.fn();

    const subscription = subscribeToServerPresence({
      serverId: "server-1",
      userId: "user-1",
      onSync,
      onError,
    });

    await vi.waitFor(() =>
      expect(presenceState.rpc).toHaveBeenCalledWith("heartbeat_presence_v2", {
        p_server_id: "server-1",
        p_voice_channel_id: null,
      }),
    );
    await vi.waitFor(() =>
      expect(onSync).toHaveBeenCalledWith({
        onlineUserIds: new Set(["user-2"]),
        voiceSessions: [
          {
            userId: "user-2",
            channelId: "voice-1",
            joinedAt: "2026-07-11T12:00:00.000Z",
            isStreaming: false,
          },
        ],
      }),
    );
    expect(onError).not.toHaveBeenCalled();

    await subscription.setVoiceState("voice-2", true);
    expect(presenceState.rpc).toHaveBeenLastCalledWith(
      "heartbeat_presence_v2",
      {
        p_server_id: "server-1",
        p_voice_channel_id: "voice-2",
      },
    );
    subscription.stop();
  });
});
