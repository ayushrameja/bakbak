import { describe, expect, it } from "vitest";

import {
  clampSoundVolume,
  createSoundEvent,
  deduplicateSoundEvents,
  encodeSoundEvent,
  hasSeenSoundEvent,
  parseSoundEvent,
} from "./sound-events";

const event = createSoundEvent({
  eventId: "event-1",
  soundId: "Air_Horn",
  senderId: "user-1",
  sentAt: 1_752_192_000_000,
  volume: 0.75,
});

describe("sound events", () => {
  it("creates a canonical event and clamps its volume", () => {
    expect(event).toMatchObject({
      type: "soundboard:play",
      version: 1,
      soundId: "air_horn",
      volume: 0.75,
    });
    expect(
      createSoundEvent({ ...event, eventId: "event-2", volume: 9 }).volume,
    ).toBe(1);
  });

  it("rejects malformed creation input", () => {
    expect(() =>
      createSoundEvent({ ...event, eventId: " ", sentAt: -1 }),
    ).toThrow(TypeError);
    expect(() =>
      createSoundEvent({ ...event, soundId: "not/a/sound" }),
    ).toThrow(TypeError);
  });

  it("round-trips LiveKit byte payloads", () => {
    expect(parseSoundEvent(encodeSoundEvent(event))).toEqual(event);
  });

  it("parses JSON strings and already-decoded records", () => {
    expect(parseSoundEvent(JSON.stringify(event))).toEqual(event);
    expect(parseSoundEvent(event)).toEqual(event);
  });

  it.each([
    ["not json"],
    [JSON.stringify({ ...event, version: 2 })],
    [JSON.stringify({ ...event, soundId: "../../oops" })],
    [JSON.stringify({ ...event, volume: 1.1 })],
  ])("rejects untrusted payload %j", (payload) => {
    expect(parseSoundEvent(payload)).toBeNull();
  });

  it("deduplicates by event ID using first-event-wins semantics", () => {
    const duplicate = { ...event, soundId: "applause" };
    const second = { ...event, eventId: "event-2", soundId: "bruh" };

    expect(deduplicateSoundEvents([event, duplicate, second])).toEqual([
      event,
      second,
    ]);
    expect(hasSeenSoundEvent(event, new Set(["event-1"]))).toBe(true);
  });
});

describe("clampSoundVolume", () => {
  it.each([
    [-1, 0],
    [0.4, 0.4],
    [2, 1],
    [Number.NaN, 1],
  ])("clamps %s to %s", (value, expected) => {
    expect(clampSoundVolume(value)).toBe(expected);
  });
});
