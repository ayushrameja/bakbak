export const SOUND_EVENT_TYPE = "soundboard:play" as const;
export const SOUND_EVENT_VERSION = 1 as const;

export interface SoundEvent {
  type: typeof SOUND_EVENT_TYPE;
  version: typeof SOUND_EVENT_VERSION;
  eventId: string;
  soundId: string;
  senderId: string;
  sentAt: number;
  volume: number;
}

export interface CreateSoundEventInput {
  eventId: string;
  soundId: string;
  senderId: string;
  sentAt: number;
  volume?: number;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function clampSoundVolume(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) {
    return clampSoundVolume(fallback, 1);
  }

  return Math.min(1, Math.max(0, value));
}

export function createSoundEvent(input: CreateSoundEventInput): SoundEvent {
  const eventId = requireIdentifier(input.eventId, "eventId", 128);
  const soundId = requireSoundId(input.soundId);
  const senderId = requireIdentifier(input.senderId, "senderId", 128);

  if (!Number.isSafeInteger(input.sentAt) || input.sentAt < 0) {
    throw new TypeError("sentAt must be a non-negative integer timestamp");
  }

  return {
    type: SOUND_EVENT_TYPE,
    version: SOUND_EVENT_VERSION,
    eventId,
    soundId,
    senderId,
    sentAt: input.sentAt,
    volume: clampSoundVolume(input.volume ?? 1),
  };
}

export function encodeSoundEvent(event: SoundEvent): Uint8Array {
  return textEncoder.encode(JSON.stringify(event));
}

export function parseSoundEvent(payload: unknown): SoundEvent | null {
  const value = decodePayload(payload);

  if (!isRecord(value)) {
    return null;
  }

  if (
    value.type !== SOUND_EVENT_TYPE ||
    value.version !== SOUND_EVENT_VERSION
  ) {
    return null;
  }

  if (
    !isIdentifier(value.eventId, 128) ||
    !isSoundId(value.soundId) ||
    !isIdentifier(value.senderId, 128) ||
    !Number.isSafeInteger(value.sentAt) ||
    (value.sentAt as number) < 0 ||
    typeof value.volume !== "number" ||
    !Number.isFinite(value.volume) ||
    value.volume < 0 ||
    value.volume > 1
  ) {
    return null;
  }

  return {
    type: SOUND_EVENT_TYPE,
    version: SOUND_EVENT_VERSION,
    eventId: value.eventId,
    soundId: value.soundId,
    senderId: value.senderId,
    sentAt: value.sentAt as number,
    volume: value.volume,
  };
}

/** Keeps the first occurrence, matching at-most-once playback semantics. */
export function deduplicateSoundEvents(
  events: readonly SoundEvent[],
): SoundEvent[] {
  const seen = new Set<string>();

  return events.filter((event) => {
    if (seen.has(event.eventId)) {
      return false;
    }

    seen.add(event.eventId);
    return true;
  });
}

export function hasSeenSoundEvent(
  event: Pick<SoundEvent, "eventId">,
  seenEventIds: ReadonlySet<string>,
): boolean {
  return seenEventIds.has(event.eventId);
}

function decodePayload(payload: unknown): unknown {
  if (typeof payload === "string") {
    return parseJson(payload);
  }

  // ArrayBuffer.isView works across browser/jsdom realms, while instanceof
  // Uint8Array can fail when LiveKit and the app use different globals.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value
  );
}

function isSoundId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^[a-z0-9][a-z0-9_-]*$/.test(value)
  );
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

function requireSoundId(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!isSoundId(normalized)) {
    throw new TypeError(
      "soundId must contain only lowercase letters, numbers, underscores, or hyphens",
    );
  }

  return normalized;
}
