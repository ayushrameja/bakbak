import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel, ChannelCategory } from "./types";
import {
  createLiveChannel,
  reconcileChannelCategories,
  reconcileChannels,
  renameLiveChannel,
  subscribeToLiveChannelCategories,
  subscribeToLiveChannels,
} from "./channel-service";

const channelState = vi.hoisted(() => {
  const realtimeChannel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  return {
    channel: vi.fn(),
    realtimeChannel,
    removeChannel: vi.fn(),
    rpc: vi.fn(),
    single: vi.fn(),
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    returns: vi.fn(),
  };
});

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    channel: channelState.channel,
    removeChannel: channelState.removeChannel,
    rpc: channelState.rpc,
    from: channelState.from,
  }),
}));

const textRow = {
  id: "channel-2",
  server_id: "server-1",
  category_id: null,
  name: "planning",
  kind: "text" as const,
  purpose: "chat" as const,
  position: 20,
};

const categoryRow = {
  id: "category-system",
  server_id: "server-1",
  name: "System",
  position: 0,
};

describe("channel service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelState.rpc.mockReturnValue({ single: channelState.single });
    channelState.realtimeChannel.on.mockReturnValue(
      channelState.realtimeChannel,
    );
    channelState.realtimeChannel.subscribe.mockReturnValue(
      channelState.realtimeChannel,
    );
    channelState.channel.mockReturnValue(channelState.realtimeChannel);
    channelState.single.mockResolvedValue({ data: textRow, error: null });
    channelState.from.mockReturnValue({ select: channelState.select });
    channelState.select.mockReturnValue({ eq: channelState.eq });
    channelState.eq.mockReturnValue({ order: channelState.order });
    channelState.order.mockReturnValue({ returns: channelState.returns });
    channelState.returns.mockResolvedValue({ data: [], error: null });
  });

  it("creates a live channel through the guarded RPC and maps its row", async () => {
    await expect(
      createLiveChannel({
        serverId: "server-1",
        kind: "text",
        name: "  planning  ",
      }),
    ).resolves.toEqual({
      id: "channel-2",
      serverId: "server-1",
      categoryId: null,
      name: "planning",
      kind: "text",
      purpose: "chat",
      position: 20,
      topic: "A private conversation for server members.",
    });
    expect(channelState.rpc).toHaveBeenCalledWith("create_channel", {
      p_server_id: "server-1",
      p_kind: "text",
      p_name: "planning",
    });
  });

  it("renames through the guarded RPC and rejects invalid names locally", async () => {
    await renameLiveChannel({ channelId: "channel-2", name: "  planning  " });
    expect(channelState.rpc).toHaveBeenCalledWith("rename_channel", {
      p_channel_id: "channel-2",
      p_name: "planning",
    });

    await expect(
      createLiveChannel({ serverId: "server-1", kind: "voice", name: "  " }),
    ).rejects.toThrow("Channel names must be between 1 and 80 characters.");
    expect(channelState.rpc).toHaveBeenCalledOnce();
  });

  it("normalizes duplicate-name database errors", async () => {
    channelState.single.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "channel_name_unavailable" },
    });

    await expect(
      createLiveChannel({
        serverId: "server-1",
        kind: "text",
        name: "planning",
      }),
    ).rejects.toThrow("A channel of that type already uses this name.");
  });

  it("subscribes before catching up, then handles live changes and cleanup", async () => {
    const onChannel = vi.fn<(channel: Channel) => void>();
    const unsubscribe = subscribeToLiveChannels("server-1", onChannel);

    expect(channelState.channel).toHaveBeenCalledWith("channels:server-1");
    expect(channelState.realtimeChannel.on).toHaveBeenCalledTimes(2);
    expect(channelState.realtimeChannel.on).toHaveBeenNthCalledWith(
      1,
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "channels",
        filter: "server_id=eq.server-1",
      },
      expect.any(Function),
    );
    expect(channelState.realtimeChannel.on).toHaveBeenNthCalledWith(
      2,
      "postgres_changes",
      expect.objectContaining({ event: "UPDATE" }),
      expect.any(Function),
    );

    const statusHandler = channelState.realtimeChannel.subscribe.mock
      .calls[0]?.[0] as ((status: string) => void) | undefined;
    statusHandler?.("SUBSCRIBED");
    await vi.waitFor(() => expect(channelState.returns).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(onChannel).not.toHaveBeenCalled());

    const insertHandler = channelState.realtimeChannel.on.mock.calls[0]?.[2] as
      ((payload: { new: typeof textRow }) => void) | undefined;
    insertHandler?.({ new: textRow });
    expect(onChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: textRow.id, name: textRow.name }),
    );

    unsubscribe();
    expect(channelState.removeChannel).toHaveBeenCalledWith(
      channelState.realtimeChannel,
    );
  });

  it("replays buffered Realtime changes after a stale catch-up snapshot", async () => {
    let resolveSnapshot:
      | ((value: { data: Array<typeof textRow>; error: null }) => void)
      | undefined;
    channelState.returns.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const onChannel = vi.fn<(channel: Channel) => void>();
    subscribeToLiveChannels("server-1", onChannel);

    const statusHandler = channelState.realtimeChannel.subscribe.mock
      .calls[0]?.[0] as ((status: string) => void) | undefined;
    const updateHandler = channelState.realtimeChannel.on.mock.calls[1]?.[2] as
      ((payload: { new: typeof textRow }) => void) | undefined;
    statusHandler?.("SUBSCRIBED");
    updateHandler?.({ new: { ...textRow, name: "newer-name" } });
    expect(onChannel).not.toHaveBeenCalled();

    resolveSnapshot?.({
      data: [{ ...textRow, name: "stale-name" }],
      error: null,
    });
    await vi.waitFor(() => expect(onChannel).toHaveBeenCalledTimes(2));
    expect(onChannel.mock.calls.map(([channel]) => channel.name)).toEqual([
      "stale-name",
      "newer-name",
    ]);
  });

  it("catches up and subscribes to live channel categories", async () => {
    channelState.returns.mockResolvedValueOnce({
      data: [categoryRow],
      error: null,
    });
    const onCategory = vi.fn<(category: ChannelCategory) => void>();
    const unsubscribe = subscribeToLiveChannelCategories(
      "server-1",
      onCategory,
    );

    expect(channelState.channel).toHaveBeenCalledWith(
      "channel-categories:server-1",
    );
    expect(channelState.realtimeChannel.on).toHaveBeenNthCalledWith(
      1,
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "channel_categories",
        filter: "server_id=eq.server-1",
      },
      expect.any(Function),
    );
    expect(channelState.realtimeChannel.on).toHaveBeenNthCalledWith(
      2,
      "postgres_changes",
      expect.objectContaining({
        event: "UPDATE",
        table: "channel_categories",
      }),
      expect.any(Function),
    );

    const statusHandler = channelState.realtimeChannel.subscribe.mock
      .calls[0]?.[0] as ((status: string) => void) | undefined;
    statusHandler?.("SUBSCRIBED");
    await vi.waitFor(() =>
      expect(onCategory).toHaveBeenCalledWith({
        id: "category-system",
        serverId: "server-1",
        name: "System",
        position: 0,
      }),
    );

    unsubscribe();
    expect(channelState.removeChannel).toHaveBeenCalledWith(
      channelState.realtimeChannel,
    );
  });

  it("reconciles by ID and keeps position-plus-ID ordering deterministic", () => {
    const first = makeChannel({ id: "channel-a", position: 10 });
    const replaced = makeChannel({
      id: "channel-b",
      name: "renamed",
      position: 10,
    });
    const current = [
      first,
      makeChannel({ id: "channel-b", name: "old", position: 30 }),
    ];

    expect(reconcileChannels(current, replaced)).toEqual([first, replaced]);
    expect(current[1]?.name).toBe("old");

    const added = makeChannel({ id: "channel-c", position: 40 });
    expect(reconcileChannels(current, added)).toHaveLength(3);

    const categories = [
      makeCategory({ id: "welcome", name: "Welcome", position: 10 }),
    ];
    expect(
      reconcileChannelCategories(
        categories,
        makeCategory({ id: "system", name: "System", position: 0 }),
      ).map((category) => category.name),
    ).toEqual(["System", "Welcome"]);
  });
});

function makeChannel(overrides: Partial<Channel>): Channel {
  return {
    id: "channel-default",
    serverId: "server-1",
    categoryId: null,
    name: "general",
    kind: "text",
    position: 0,
    topic: "Private chat",
    ...overrides,
  };
}

function makeCategory(overrides: Partial<ChannelCategory>): ChannelCategory {
  return {
    id: "category-default",
    serverId: "server-1",
    name: "Welcome",
    position: 10,
    ...overrides,
  };
}
