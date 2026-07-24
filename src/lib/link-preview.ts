import { openUrl } from "@tauri-apps/plugin-opener";
import type { ConversationMessage, LinkPreview, MessageScope } from "./types";
import { getSupabaseClient } from "./supabase";

export type MessageTextToken =
  { type: "text"; text: string } | { type: "link"; text: string; url: string };

const PREVIEW_RETRY_MS = 24 * 60 * 60 * 1000;

export function tokenizeMessageText(text: string): MessageTextToken[] {
  const tokens: MessageTextToken[] = [];
  const pattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const linked = trimTrailingPunctuation(raw);
    if (start > cursor) {
      tokens.push({ type: "text", text: text.slice(cursor, start) });
    }
    if (linked) {
      try {
        const url = new URL(
          linked.startsWith("www.") ? `https://${linked}` : linked,
        );
        if (url.protocol === "http:" || url.protocol === "https:") {
          tokens.push({ type: "link", text: linked, url: url.toString() });
        } else {
          tokens.push({ type: "text", text: linked });
        }
      } catch {
        tokens.push({ type: "text", text: linked });
      }
    }
    const suffix = raw.slice(linked.length);
    if (suffix) tokens.push({ type: "text", text: suffix });
    cursor = start + raw.length;
  }
  if (cursor < text.length) {
    tokens.push({ type: "text", text: text.slice(cursor) });
  }
  const merged = tokens.reduce<MessageTextToken[]>((result, token) => {
    const previous = result.at(-1);
    if (token.type === "text" && previous?.type === "text") {
      previous.text += token.text;
    } else {
      result.push(token);
    }
    return result;
  }, []);
  return merged.length ? merged : [{ type: "text", text }];
}

export async function openExternalLink(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    await openUrl(parsed.toString());
    return;
  }
  window.open(parsed.toString(), "_blank", "noopener,noreferrer");
}

export function shouldRequestLinkPreview(
  message: ConversationMessage,
  attempted: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  if (
    message.pending ||
    (message.messageKind ?? "member") !== "member" ||
    message.linkPreview ||
    attempted.has(message.id)
  ) {
    return false;
  }
  if (
    message.linkPreviewAttemptedAt &&
    now - Date.parse(message.linkPreviewAttemptedAt) < PREVIEW_RETRY_MS
  ) {
    return false;
  }
  return messageTextHasLink(message);
}

export async function requestLinkPreview(
  scope: MessageScope,
  messageId: string,
): Promise<LinkPreview | null> {
  const response = (await getSupabaseClient().functions.invoke("link-preview", {
    body: { scope, messageId },
  })) as {
    data: { preview: LinkPreview | null } | null;
    error: unknown;
  };
  if (response.error) {
    throw response.error instanceof Error
      ? response.error
      : new Error("Link preview request failed.");
  }
  return response.data?.preview ?? null;
}

function messageTextHasLink(message: ConversationMessage): boolean {
  const texts = message.content
    ? message.content.flatMap((segment) =>
        segment.type === "text" ? [segment.text] : [],
      )
    : [message.body];
  return texts.some((text) =>
    tokenizeMessageText(text).some((token) => token.type === "link"),
  );
}

function trimTrailingPunctuation(value: string): string {
  let result = value;
  while (/[.,!?;:\]}]$/.test(result)) result = result.slice(0, -1);
  while (
    result.endsWith(")") &&
    (result.match(/\(/g)?.length ?? 0) < (result.match(/\)/g)?.length ?? 0)
  ) {
    result = result.slice(0, -1);
  }
  return result;
}
