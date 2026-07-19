import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

interface PresenceHeartbeatRow {
  user_id: string;
  last_seen_at: string;
  voice_channel_id: string | null;
  voice_joined_at: string | null;
  is_streaming: boolean;
}

type PresenceHeartbeatDatabaseRow = Omit<
  PresenceHeartbeatRow,
  "is_streaming"
> & {
  is_streaming?: boolean;
};

export interface VoicePresenceSession {
  userId: string;
  channelId: string;
  joinedAt: string;
  isStreaming: boolean;
}

export interface ServerPresenceSnapshot {
  onlineUserIds: ReadonlySet<string>;
  voiceSessions: ReadonlyArray<VoicePresenceSession>;
}

interface PresenceSubscriptionOptions {
  serverId: string;
  userId: string;
  initialVoiceChannelId?: string | null;
  onSync: (snapshot: ServerPresenceSnapshot) => void;
  onError?: (message: string) => void;
}

export interface ServerPresenceSubscription {
  setVoiceState: (
    channelId: string | null,
    isStreaming?: boolean,
  ) => Promise<void>;
  stop: () => void;
}

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;
export const PRESENCE_EXPIRY_MS = 55_000;
const PRESENCE_EXPIRY_CHECK_MS = 5_000;

export function presenceSnapshotFromHeartbeats(
  heartbeats: ReadonlyArray<PresenceHeartbeatRow>,
  now = Date.now(),
): ServerPresenceSnapshot {
  const cutoff = now - PRESENCE_EXPIRY_MS;
  const active = heartbeats.filter(
    (heartbeat) => Date.parse(heartbeat.last_seen_at) >= cutoff,
  );
  return {
    onlineUserIds: new Set(active.map((heartbeat) => heartbeat.user_id)),
    voiceSessions: active.flatMap((heartbeat) =>
      heartbeat.voice_channel_id && heartbeat.voice_joined_at
        ? [
            {
              userId: heartbeat.user_id,
              channelId: heartbeat.voice_channel_id,
              joinedAt: heartbeat.voice_joined_at,
              isStreaming: heartbeat.is_streaming,
            },
          ]
        : [],
    ),
  };
}

export function subscribeToServerPresence({
  serverId,
  userId,
  initialVoiceChannelId = null,
  onSync,
  onError,
}: PresenceSubscriptionOptions): ServerPresenceSubscription {
  const supabase = getSupabaseClient();
  let channel: RealtimeChannel | null = null;
  let heartbeats: PresenceHeartbeatRow[] = [];
  let voiceChannelId = initialVoiceChannelId;
  let isStreaming = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let expiryTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let refreshInFlight: Promise<void> | null = null;
  let heartbeatVersion: "v3" | "v2" = "v3";

  onSync({ onlineUserIds: new Set([userId]), voiceSessions: [] });

  const emit = () => {
    if (!stopped) onSync(presenceSnapshotFromHeartbeats(heartbeats));
  };

  const refresh = (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const current = await supabase
        .from("presence_heartbeats")
        .select(
          "user_id,last_seen_at,voice_channel_id,voice_joined_at,is_streaming",
        )
        .eq("server_id", serverId)
        .returns<PresenceHeartbeatDatabaseRow[]>();
      let rows = current.data;
      if (current.error) {
        const legacy = await supabase
          .from("presence_heartbeats")
          .select("user_id,last_seen_at,voice_channel_id,voice_joined_at")
          .eq("server_id", serverId)
          .returns<PresenceHeartbeatDatabaseRow[]>();
        if (legacy.error) throw legacy.error;
        rows = legacy.data;
      }
      heartbeats = (rows ?? []).map((row) => ({
        ...row,
        is_streaming: row.is_streaming === true,
      }));
      emit();
    })()
      .catch(() => {
        if (!stopped) onError?.("Online status could not be refreshed.");
      })
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  };

  const heartbeat = async () => {
    if (heartbeatVersion === "v3") {
      const { error } = await supabase.rpc("heartbeat_presence_v3", {
        p_server_id: serverId,
        p_voice_channel_id: voiceChannelId,
        p_is_streaming: voiceChannelId === null ? false : isStreaming,
      });
      if (!error) {
        await refresh();
        return;
      }
      heartbeatVersion = "v2";
    }
    const { error } = await supabase.rpc("heartbeat_presence_v2", {
      p_server_id: serverId,
      p_voice_channel_id: voiceChannelId,
    });
    if (error) throw error;
    await refresh();
  };

  void (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      onError?.("Online status could not authenticate.");
      return;
    }
    await supabase.realtime.setAuth(data.session.access_token);
    if (stopped) return;

    channel = supabase
      .channel(`presence-heartbeats:${serverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence_heartbeats",
          filter: `server_id=eq.${serverId}`,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (
          !stopped &&
          (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
            status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT)
        ) {
          onError?.("Live online-status updates are temporarily unavailable.");
        }
      });

    void heartbeat().catch(() => {
      if (!stopped) onError?.("Online status could not be published.");
    });
    heartbeatTimer = setInterval(() => {
      void heartbeat().catch(() => {
        if (!stopped) onError?.("Online status could not be published.");
      });
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);
    expiryTimer = setInterval(emit, PRESENCE_EXPIRY_CHECK_MS);
  })().catch(() => {
    if (!stopped) onError?.("Online status could not start.");
  });

  return {
    async setVoiceState(nextChannelId, nextIsStreaming = false) {
      const normalizedStreaming =
        nextChannelId === null ? false : nextIsStreaming;
      if (
        stopped ||
        (voiceChannelId === nextChannelId &&
          isStreaming === normalizedStreaming)
      ) {
        return;
      }
      voiceChannelId = nextChannelId;
      isStreaming = normalizedStreaming;
      await heartbeat().catch(() => {
        if (!stopped) onError?.("Voice-room activity could not be published.");
      });
    },
    stop() {
      stopped = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (expiryTimer) clearInterval(expiryTimer);
      if (channel) void supabase.removeChannel(channel);
    },
  };
}
