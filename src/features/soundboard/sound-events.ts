export const SOUND_PLAY_EVENT_TYPE = "soundboard:play" as const;
export const SOUND_STOP_EVENT_TYPE = "soundboard:stop-all" as const;
export const SOUND_EVENT_VERSION = 2 as const;

interface SoundEventBase {
  version: typeof SOUND_EVENT_VERSION;
  eventId: string;
  sentAt: number;
}

export interface SoundPlayEvent extends SoundEventBase {
  type: typeof SOUND_PLAY_EVENT_TYPE;
  soundId: string;
}

export interface SoundStopEvent extends SoundEventBase {
  type: typeof SOUND_STOP_EVENT_TYPE;
}

export type SoundEvent = SoundPlayEvent | SoundStopEvent;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function createSoundPlayEvent(input: {
  eventId: string;
  soundId: string;
  sentAt: number;
}): SoundPlayEvent {
  return {
    type: SOUND_PLAY_EVENT_TYPE,
    version: SOUND_EVENT_VERSION,
    eventId: requireIdentifier(input.eventId, "eventId", 128),
    soundId: requireIdentifier(input.soundId, "soundId", 128),
    sentAt: requireTimestamp(input.sentAt),
  };
}

export function createSoundStopEvent(input: {
  eventId: string;
  sentAt: number;
}): SoundStopEvent {
  return {
    type: SOUND_STOP_EVENT_TYPE,
    version: SOUND_EVENT_VERSION,
    eventId: requireIdentifier(input.eventId, "eventId", 128),
    sentAt: requireTimestamp(input.sentAt),
  };
}

export function encodeSoundEvent(event: SoundEvent): Uint8Array {
  return textEncoder.encode(JSON.stringify(event));
}

export function parseSoundEvent(payload: unknown): SoundEvent | null {
  const value = decodePayload(payload);
  if (!isRecord(value) || value.version !== SOUND_EVENT_VERSION) return null;
  if (
    !isIdentifier(value.eventId, 128) ||
    !Number.isSafeInteger(value.sentAt) ||
    (value.sentAt as number) < 0
  ) {
    return null;
  }

  if (
    value.type === SOUND_PLAY_EVENT_TYPE &&
    isIdentifier(value.soundId, 128)
  ) {
    return {
      type: value.type,
      version: SOUND_EVENT_VERSION,
      eventId: value.eventId,
      soundId: value.soundId,
      sentAt: value.sentAt as number,
    };
  }

  if (value.type === SOUND_STOP_EVENT_TYPE) {
    return {
      type: value.type,
      version: SOUND_EVENT_VERSION,
      eventId: value.eventId,
      sentAt: value.sentAt as number,
    };
  }

  return null;
}

export function hasSeenSoundEvent(
  event: Pick<SoundEvent, "eventId">,
  seenEventIds: ReadonlySet<string>,
): boolean {
  return seenEventIds.has(event.eventId);
}

function decodePayload(payload: unknown): unknown {
  if (typeof payload === "string") return parseJson(payload);
  if (ArrayBuffer.isView(payload)) {
    const bytes = new Uint8Array(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    return parseJson(textDecoder.decode(bytes));
  }
  if (payload instanceof ArrayBuffer) {
    return parseJson(textDecoder.decode(new Uint8Array(payload)));
  }
  return payload;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function requireTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("sentAt must be a non-negative integer timestamp");
  }
  return value;
}

function requireIdentifier(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value.trim();
  if (!isIdentifier(normalized, maxLength)) {
    throw new TypeError(
      `${field} must be between 1 and ${maxLength} characters`,
    );
  }
  return normalized;
}

function isIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
