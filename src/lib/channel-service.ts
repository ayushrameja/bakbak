import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import type { Channel, ChannelKind } from "./types";
import { getSupabaseClient } from "./supabase";

interface ChannelRow {
  id: string;
  server_id: string;
  category_id: string | null;
  name: string;
  kind: ChannelKind;
  position: number;
}

export interface CreateChannelInput {
  serverId: string;
  kind: ChannelKind;
  name: string;
}

export interface RenameChannelInput {
  channelId: string;
  name: string;
}

export async function createLiveChannel(
  input: CreateChannelInput,
): Promise<Channel> {
  const name = normalizeChannelName(input.name);
  const { data, error } = await getSupabaseClient()
    .rpc("create_channel", {
      p_server_id: input.serverId,
      p_kind: input.kind,
      p_name: name,
    })
    .single<ChannelRow>();
  if (error) throwChannelError(error);
  return channelFromRow(data);
}

export async function renameLiveChannel(
  input: RenameChannelInput,
): Promise<Channel> {
  const name = normalizeChannelName(input.name);
  const { data, error } = await getSupabaseClient()
    .rpc("rename_channel", {
      p_channel_id: input.channelId,
      p_name: name,
    })
    .single<ChannelRow>();
  if (error) throwChannelError(error);
  return channelFromRow(data);
}

export function subscribeToLiveChannels(
  serverId: string,
  onChannel: (channel: Channel) => void,
): () => void {
  const supabase = getSupabaseClient();
  let stopped = false;
  let snapshotStarted = false;
  let snapshotApplied = false;
  const bufferedChannels: Channel[] = [];
  const receiveRow = (row: ChannelRow) => {
    const channel = channelFromRow(row);
    if (snapshotApplied) onChannel(channel);
    else bufferedChannels.push(channel);
  };
  const realtimeChannel: RealtimeChannel = supabase
    .channel(`channels:${serverId}`)
    .on<ChannelRow>(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "channels",
        filter: `server_id=eq.${serverId}`,
      },
      (payload) => receiveRow(payload.new),
    )
    .on<ChannelRow>(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "channels",
        filter: `server_id=eq.${serverId}`,
      },
      (payload) => receiveRow(payload.new),
    )
    .subscribe((status) => {
      if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED || snapshotStarted) {
        return;
      }
      snapshotStarted = true;
      void (async () => {
        try {
          const { data, error } = await supabase
            .from("channels")
            .select("id,server_id,category_id,name,kind,position")
            .eq("server_id", serverId)
            .order("position")
            .returns<ChannelRow[]>();
          if (stopped) return;
          if (!error) {
            data.forEach((row) => onChannel(channelFromRow(row)));
          }
        } catch {
          if (stopped) return;
        }
        snapshotApplied = true;
        bufferedChannels.splice(0).forEach(onChannel);
      })();
    });

  return () => {
    stopped = true;
    void supabase.removeChannel(realtimeChannel);
  };
}

export function reconcileChannels(
  current: readonly Channel[],
  incoming: Channel,
): Channel[] {
  const existingIndex = current.findIndex(
    (channel) => channel.id === incoming.id,
  );
  const reconciled =
    existingIndex === -1
      ? [...current, incoming]
      : current.map((channel, index) =>
          index === existingIndex ? incoming : channel,
        );
  return reconciled.sort(compareChannels);
}

function normalizeChannelName(value: string): string {
  const name = value.trim();
  const characterCount = Array.from(name).length;
  if (characterCount < 1 || characterCount > 80) {
    throw new Error("Channel names must be between 1 and 80 characters.");
  }
  return name;
}

function channelFromRow(row: ChannelRow): Channel {
  return {
    id: row.id,
    serverId: row.server_id,
    categoryId: row.category_id,
    name: row.name,
    kind: row.kind,
    position: row.position,
    topic:
      row.kind === "voice"
        ? "Drop in when you feel like talking."
        : "A private conversation for server members.",
  };
}

function compareChannels(left: Channel, right: Channel): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

function throwChannelError(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && error.code === "23505") ||
      ("message" in error && error.message === "channel_name_unavailable"))
  ) {
    throw new Error("A channel of that type already uses this name.");
  }
  throw error;
}
