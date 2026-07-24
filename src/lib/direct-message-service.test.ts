import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadDirectConversations,
  subscribeToDirectMessages,
  subscribeToDirectReadStates,
} from "./direct-message-service";

const directState = vi.hoisted(() => {
  const realtimeChannel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  return {
    rpc: vi.fn(),
    channel: vi.fn(),
    realtimeChannel,
    removeChannel: vi.fn(),
  };
});

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    rpc: directState.rpc,
    channel: directState.channel,
    removeChannel: directState.removeChannel,
  }),
}));

const conversationRow = {
  conversation_id: "conversation-1",
  other_user_id: "friend-1",
  display_name: "Mira",
  avatar_url: null,
  avatar_path: "friend-1/avatar",
  avatar_animation_path: null,
  cover_path: "friend-1/cover",
  cover_animation_path: null,
  cover_position_x: 50,
  cover_position_y: 35,
  description: "Makes things",
  created_at: "2026-07-19T10:00:00.000Z",
  updated_at: "2026-07-19T10:05:00.000Z",
  latest_message_id: "message-1",
  latest_message_author_id: "friend-1",
  latest_message_body: "Private hello",
  latest_message_created_at: "2026-07-19T10:05:00.000Z",
  has_unread: true,
};

describe("direct message service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    directState.realtimeChannel.on.mockReturnValue(directState.realtimeChannel);
    directState.realtimeChannel.subscribe.mockReturnValue(
      directState.realtimeChannel,
    );
    directState.channel.mockReturnValue(directState.realtimeChannel);
  });

  it("maps RLS-filtered conversation activity into renderer models", async () => {
    directState.rpc.mockResolvedValue({
      data: [conversationRow],
      error: null,
    });

    const conversations = await loadDirectConversations();
    expect(conversations[0]).toMatchObject({
      id: "conversation-1",
      hasUnread: true,
      latestMessageBody: "Private hello",
    });
    expect(conversations[0]?.otherMember).toMatchObject({
      id: "friend-1",
      displayName: "Mira",
      description: "Makes things",
      coverPositionY: 35,
    });
    expect(directState.rpc).toHaveBeenCalledWith("get_direct_conversations");
  });

  it("subscribes to participant-authorized messages and owner read states", async () => {
    const onMessage = vi.fn();
    const onReadState = vi.fn();
    const unsubscribeMessages = subscribeToDirectMessages(onMessage);
    const unsubscribeReads = subscribeToDirectReadStates("user-1", onReadState);

    expect(directState.realtimeChannel.on).toHaveBeenNthCalledWith(
      1,
      "postgres_changes",
      expect.objectContaining({
        event: "*",
        table: "direct_messages",
      }),
      expect.any(Function),
    );
    expect(directState.realtimeChannel.on).toHaveBeenNthCalledWith(
      2,
      "postgres_changes",
      expect.objectContaining({
        event: "*",
        table: "direct_read_states",
        filter: "user_id=eq.user-1",
      }),
      expect.any(Function),
    );

    const messageHandler = directState.realtimeChannel.on.mock.calls[0]?.[2] as
      ((payload: { new: Record<string, unknown> }) => void) | undefined;
    messageHandler?.({
      new: {
        id: "message-1",
        conversation_id: "conversation-1",
        author_id: "friend-1",
        body: "Hello",
        content: [{ type: "text", text: "Hello" }],
        created_at: "2026-07-19T10:05:00.000Z",
      },
    });
    await vi.waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conversation-1",
          body: "Hello",
        }),
      ),
    );

    const readHandler = directState.realtimeChannel.on.mock.calls[1]?.[2] as
      ((payload: { new: Record<string, unknown> }) => void) | undefined;
    readHandler?.({
      new: {
        user_id: "user-1",
        conversation_id: "conversation-1",
        last_read_message_id: "message-1",
      },
    });
    expect(onReadState).toHaveBeenCalledWith("conversation-1", "message-1");

    unsubscribeMessages();
    unsubscribeReads();
    expect(directState.removeChannel).toHaveBeenCalledTimes(2);
  });
});
