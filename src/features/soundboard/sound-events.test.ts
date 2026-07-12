import { describe, expect, it } from "vitest";
import {
  createSoundPlayEvent,
  createSoundStopEvent,
  encodeSoundEvent,
  hasSeenSoundEvent,
  parseSoundEvent,
} from "./sound-events";

const playEvent = createSoundPlayEvent({
  eventId: "event-1",
  soundId: "00000000-0000-4000-8000-000000002001",
  sentAt: 1_752_192_000_000,
});

describe("soundboard control events", () => {
  it("creates version-two play and stop events without sender volume", () => {
    expect(playEvent).toEqual({
      type: "soundboard:play",
      version: 2,
      eventId: "event-1",
      soundId: "00000000-0000-4000-8000-000000002001",
      sentAt: 1_752_192_000_000,
    });
    expect(
      createSoundStopEvent({ eventId: "stop-1", sentAt: 1_752_192_000_001 }),
    ).toEqual({
      type: "soundboard:stop-all",
      version: 2,
      eventId: "stop-1",
      sentAt: 1_752_192_000_001,
    });
  });

  it("round-trips LiveKit byte payloads", () => {
    expect(parseSoundEvent(encodeSoundEvent(playEvent))).toEqual(playEvent);
  });

  it("rejects legacy, malformed, and sender-controlled payloads", () => {
    expect(
      parseSoundEvent(
        JSON.stringify({ ...playEvent, version: 1, volume: 1, senderId: "x" }),
      ),
    ).toBeNull();
    expect(
      parseSoundEvent(JSON.stringify({ ...playEvent, soundId: "" })),
    ).toBeNull();
    expect(parseSoundEvent("not json")).toBeNull();
  });

  it("deduplicates control state by event ID", () => {
    expect(hasSeenSoundEvent(playEvent, new Set(["event-1"]))).toBe(true);
    expect(hasSeenSoundEvent(playEvent, new Set())).toBe(false);
  });
});
