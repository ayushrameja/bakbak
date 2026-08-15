import { describe, expect, it, vi } from "vitest";
import {
  resumeAudioPlayback,
  restartAudioInput,
  switchAudioOutput,
  setAudioDeafened,
  switchCameraInput,
} from "./audio-actions";

describe("restartAudioInput", () => {
  const nextOptions = {
    deviceId: "studio-mic",
    echoCancellation: true,
  };
  const previousOptions = {
    deviceId: "default",
    echoCancellation: true,
  };

  it("reports a successful microphone restart", async () => {
    const restartTrack = vi.fn().mockResolvedValue(undefined);
    const getDeviceId = vi.fn().mockResolvedValue("studio-mic");
    await expect(
      restartAudioInput(
        { getDeviceId, restartTrack },
        nextOptions,
        previousOptions,
      ),
    ).resolves.toEqual({ ok: true });
    expect(restartTrack).toHaveBeenCalledWith(nextOptions);
  });

  it("restores the previous capture when the new microphone fails", async () => {
    const restartTrack = vi
      .fn()
      .mockRejectedValueOnce(new Error("device vanished"))
      .mockResolvedValueOnce(undefined);
    const getDeviceId = vi.fn().mockResolvedValue("default");
    const result = await restartAudioInput(
      { getDeviceId, restartTrack },
      nextOptions,
      previousOptions,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("previous microphone is still active");
    }
    expect(restartTrack).toHaveBeenNthCalledWith(1, nextOptions);
    expect(restartTrack).toHaveBeenNthCalledWith(2, previousOptions);
  });

  it("distinguishes a failed switch whose rollback also fails", async () => {
    const restartTrack = vi.fn().mockRejectedValue(new Error("capture failed"));
    const getDeviceId = vi.fn();
    const result = await restartAudioInput(
      { getDeviceId, restartTrack },
      nextOptions,
      previousOptions,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("couldn't restore the previous one");
    }
  });

  it("rolls back when capture resolves without opening the selected device", async () => {
    const restartTrack = vi.fn().mockResolvedValue(undefined);
    const getDeviceId = vi
      .fn()
      .mockResolvedValueOnce("built-in-mic")
      .mockResolvedValueOnce("default");

    await expect(
      restartAudioInput(
        { getDeviceId, restartTrack },
        nextOptions,
        previousOptions,
      ),
    ).resolves.toEqual(expect.objectContaining({ ok: false }));
    expect(restartTrack).toHaveBeenNthCalledWith(1, nextOptions);
    expect(restartTrack).toHaveBeenNthCalledWith(2, previousOptions);
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
