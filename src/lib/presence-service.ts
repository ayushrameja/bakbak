import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

interface PresenceHeartbeatRow {
  user_id: string;
  last_seen_at: string;
}

interface PresenceSubscriptionOptions {
  serverId: string;
  userId: string;
  onSync: (onlineUserIds: ReadonlySet<string>) => void;
  onError?: (message: string) => void;
}

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;
export const PRESENCE_EXPIRY_MS = 55_000;
const PRESENCE_EXPIRY_CHECK_MS = 5_000;

export function onlineUserIdsFromHeartbeats(
  heartbeats: ReadonlyArray<PresenceHeartbeatRow>,
  now = Date.now(),
): ReadonlySet<string> {
  const cutoff = now - PRESENCE_EXPIRY_MS;
  return new Set(
    heartbeats
      .filter((heartbeat) => Date.parse(heartbeat.last_seen_at) >= cutoff)
      .map((heartbeat) => heartbeat.user_id),
  );
}

export function subscribeToServerPresence({
  serverId,
  userId,
  onSync,
  onError,
}: PresenceSubscriptionOptions): () => void {
  const supabase = getSupabaseClient();
  let channel: RealtimeChannel | null = null;
  let heartbeats: PresenceHeartbeatRow[] = [];
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let expiryTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let refreshInFlight: Promise<void> | null = null;

  onSync(new Set([userId]));

  const emit = () => {
    if (!stopped) onSync(onlineUserIdsFromHeartbeats(heartbeats));
  };

  const refresh = (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const { data, error } = await supabase
        .from("presence_heartbeats")
        .select("user_id,last_seen_at")
        .eq("server_id", serverId)
        .returns<PresenceHeartbeatRow[]>();
      if (error) throw error;
      heartbeats = data;
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
    const { error } = await supabase.rpc("heartbeat_presence", {
      p_server_id: serverId,
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

  return () => {
    stopped = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (expiryTimer) clearInterval(expiryTimer);
    if (channel) void supabase.removeChannel(channel);
  };
}
