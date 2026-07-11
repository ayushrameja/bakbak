import { describe, expect, it } from "vitest";
import { formatVoiceElapsedTime } from "./voice-duration";

describe("formatVoiceElapsedTime", () => {
  it("formats calls below and above one hour", () => {
    const joinedAt = "2026-07-11T12:00:00.000Z";
    expect(
      formatVoiceElapsedTime(joinedAt, Date.parse(joinedAt) + 65_000),
    ).toBe("01:05");
    expect(
      formatVoiceElapsedTime(joinedAt, Date.parse(joinedAt) + 3_665_000),
    ).toBe("1:01:05");
  });
});
