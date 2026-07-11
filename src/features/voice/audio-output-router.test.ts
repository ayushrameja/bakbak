import { describe, expect, it, vi } from "vitest";
import { AudioOutputRouter } from "./audio-output-router";

describe("AudioOutputRouter", () => {
  it("reports unsupported runtimes without pretending a switch worked", async () => {
    const router = new AudioOutputRouter();
    if (router.supported) return;
    await expect(router.setDevice("speaker-1")).rejects.toThrow(
      "not supported",
    );
    expect(router.deviceId).toBe("default");
  });

  it("cleans up without requiring an active audio context", () => {
    const router = new AudioOutputRouter();
    expect(() => router.cleanup()).not.toThrow();
    vi.restoreAllMocks();
  });
});
