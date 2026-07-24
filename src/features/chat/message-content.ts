import type {
  DraftMention,
  MessageDraft,
  MessageSegment,
  ServerMember,
} from "../../lib/types";

export const EMPTY_MESSAGE_DRAFT: MessageDraft = {
  text: "",
  mentions: [],
  attachments: [],
  replyTo: null,
  notifyReplyAuthor: true,
};

export function updateDraftText(
  current: MessageDraft,
  text: string,
): MessageDraft {
  if (text === current.text) return current;
  let prefix = 0;
  while (
    prefix < current.text.length &&
    prefix < text.length &&
    current.text[prefix] === text[prefix]
  ) {
    prefix += 1;
  }

  let oldSuffix = current.text.length;
  let newSuffix = text.length;
  while (
    oldSuffix > prefix &&
    newSuffix > prefix &&
    current.text[oldSuffix - 1] === text[newSuffix - 1]
  ) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const delta = newSuffix - oldSuffix;
  const mentions = current.mentions.flatMap((mention) => {
    if (mention.end <= prefix) return [mention];
    if (mention.start >= oldSuffix) {
      return [
        { ...mention, start: mention.start + delta, end: mention.end + delta },
      ];
    }
    return [];
  });
  return { ...current, text, mentions };
}

export function insertMention(
  current: MessageDraft,
  member: ServerMember,
  start: number,
  end: number,
): MessageDraft {
  const label = `@${member.displayName}`;
  const suffix = current.text.slice(end).startsWith(" ") ? "" : " ";
  const nextText = `${current.text.slice(0, start)}${label}${suffix}${current.text.slice(end)}`;
  const replacedLength = end - start;
  const delta = label.length + suffix.length - replacedLength;
  const mentions: DraftMention[] = current.mentions
    .filter((mention) => mention.end <= start || mention.start >= end)
    .map((mention) =>
      mention.start >= end
        ? { ...mention, start: mention.start + delta, end: mention.end + delta }
        : mention,
    );
  mentions.push({
    userId: member.id,
    fallback: member.displayName,
    start,
    end: start + label.length,
  });
  mentions.sort((left, right) => left.start - right.start);
  return { ...current, text: nextText, mentions };
}

export function draftToSegments(draft: MessageDraft): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const mention of [...draft.mentions].sort(
    (left, right) => left.start - right.start,
  )) {
    if (mention.start < cursor || mention.end > draft.text.length) continue;
    const text = draft.text.slice(cursor, mention.start);
    if (text) segments.push({ type: "text", text });
    segments.push({
      type: "mention",
      userId: mention.userId,
      fallback: mention.fallback,
    });
    cursor = mention.end;
  }
  const remainder = draft.text.slice(cursor);
  if (remainder) segments.push({ type: "text", text: remainder });
  return segments;
}

export function segmentsToFallback(segments: MessageSegment[]): string {
  return segments
    .map((segment) =>
      segment.type === "text" ? segment.text : `@${segment.fallback}`,
    )
    .join("")
    .trim();
}

export function findMentionQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(beforeCursor);
  if (!match) return null;
  const query = match[1] ?? "";
  return {
    query,
    start: cursor - query.length - 1,
    end: cursor,
  };
}
