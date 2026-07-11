import type { ChatMessage } from "../../lib/types";

export function unreadChannelsAfterMessage(
  current: ReadonlySet<string>,
  message: ChatMessage,
  selectedChannelId: string,
  currentUserId: string,
): ReadonlySet<string> {
  if (
    message.authorId === currentUserId ||
    message.channelId === selectedChannelId
  ) {
    return current;
  }
  return new Set([...current, message.channelId]);
}

export function markChannelRead(
  current: ReadonlySet<string>,
  channelId: string,
): ReadonlySet<string> {
  if (!current.has(channelId)) return current;
  const next = new Set(current);
  next.delete(channelId);
  return next;
}

export function shouldPlayIncomingMessageSound(
  message: ChatMessage,
  currentUserId: string,
): boolean {
  return message.authorId !== currentUserId && !message.pending;
}
