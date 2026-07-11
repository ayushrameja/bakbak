import { describe, expect, it, vi } from "vitest";
import {
  resumeAudioPlayback,
  switchAudioOutput,
  setAudioDeafened,
  switchAudioInput,
  switchCameraInput,
} from "./audio-actions";

describe("switchAudioInput", () => {
  it("reports a successful microphone switch", async () => {
    const switchActiveDevice = vi.fn().mockResolvedValue(true);

    await expect(
      switchAudioInput({ switchActiveDevice }, "studio-mic"),
    ).resolves.toEqual({ ok: true });
    expect(switchActiveDevice).toHaveBeenCalledWith("audioinput", "studio-mic");
  });

  it.each([
    ["returns false", vi.fn().mockResolvedValue(false)],
    ["rejects", vi.fn().mockRejectedValue(new Error("device vanished"))],
  ])("keeps the previous selection when LiveKit %s", async (_label, action) => {
    const result = await switchAudioInput(
      { switchActiveDevice: action },
      "missing-mic",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("previous microphone is still active");
    }
  });
});

describe("media output and camera switching", () => {
  it("switches output and camera through LiveKit", async () => {
    const room = { switchActiveDevice: vi.fn().mockResolvedValue(true) };
    await expect(switchAudioOutput(room, "speaker-1")).resolves.toEqual({
      ok: true,
    });
    await expect(switchCameraInput(room, "camera-1")).resolves.toEqual({
      ok: true,
    });
    expect(room.switchActiveDevice).toHaveBeenNthCalledWith(
      1,
      "audiooutput",
      "speaker-1",
    );
    expect(room.switchActiveDevice).toHaveBeenNthCalledWith(
      2,
      "videoinput",
      "camera-1",
    );
  });

  it("reports output switching failure without claiming success", async () => {
    const room = { switchActiveDevice: vi.fn().mockRejectedValue(new Error()) };
    await expect(switchAudioOutput(room, "speaker-1")).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    );
  });
});

describe("resumeAudioPlayback", () => {
  it("recovers playback through LiveKit from a user gesture", async () => {
    const startAudio = vi.fn().mockResolvedValue(undefined);

    await expect(resumeAudioPlayback({ startAudio })).resolves.toEqual({
      ok: true,
    });
    expect(startAudio).toHaveBeenCalledOnce();
  });

  it("returns actionable feedback when playback remains blocked", async () => {
    const startAudio = vi.fn().mockRejectedValue(new Error("not allowed"));

    const result = await resumeAudioPlayback({ startAudio });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("try Enable audio again");
    }
  });
});

describe("setAudioDeafened", () => {
  it("keeps playback recovery behind the user's undeafen gesture", async () => {
    const calls: string[] = [];
    const startAudio = vi.fn(() => {
      calls.push("resume");
      return Promise.resolve();
    });
    const targets = {
      isCurrent: () => true,
      remoteAudio: {
        setMuted: vi.fn((muted: boolean) => {
          calls.push(`remote:${String(muted)}`);
        }),
      },
      soundPlayback: {
        setDeafened: vi.fn((deafened: boolean) => {
          calls.push(`sounds:${String(deafened)}`);
        }),
      },
    };

    await setAudioDeafened(true, true, { startAudio }, targets);

    expect(startAudio).not.toHaveBeenCalled();
    expect(calls).toEqual(["sounds:true", "remote:true"]);

    await expect(
      setAudioDeafened(false, true, { startAudio }, targets),
    ).resolves.toEqual({ ok: true });
    expect(calls).toEqual([
      "sounds:true",
      "remote:true",
      "sounds:false",
      "resume",
      "remote:false",
    ]);
  });

  it("does not unmute when Deafen is restored during playback recovery", async () => {
    let operation = 1;
    let finishRecovery: (() => void) | undefined;
    const startAudio = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRecovery = resolve;
        }),
    );
    const setMuted = vi.fn();
    const recoveryTargets = {
      isCurrent: () => operation === 1,
      remoteAudio: { setMuted },
      soundPlayback: { setDeafened: vi.fn() },
    };

    const recovery = setAudioDeafened(
      false,
      true,
      { startAudio },
      recoveryTargets,
    );
    operation = 2;
    await setAudioDeafened(
      true,
      true,
      { startAudio },
      {
        ...recoveryTargets,
        isCurrent: () => operation === 2,
      },
    );
    finishRecovery?.();
    await recovery;

    expect(startAudio).toHaveBeenCalledOnce();
    expect(setMuted).toHaveBeenLastCalledWith(true);
  });
});
