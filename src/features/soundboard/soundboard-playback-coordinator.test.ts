import { describe, expect, it, vi } from "vitest";
import type { SoundboardPlayback } from "./soundboard-audio";
import { SoundboardPlaybackCoordinator } from "./soundboard-playback-coordinator";

describe("SoundboardPlaybackCoordinator", () => {
  it("replaces A with B when A's stop completes immediately", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const first = playbackDouble();
    const second = playbackDouble();

    await coordinator.play("event-a", () => Promise.resolve(first.playback));
    await coordinator.play("event-b", () => Promise.resolve(second.playback));

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).not.toHaveBeenCalled();
    expect(coordinator.activeEventId).toBe("event-b");
  });

  it("waits for the current playback to finish before starting its replacement", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const current = playbackDouble({ finishOnStop: false });
    const replacement = playbackDouble();
    const startReplacement = vi.fn(() => Promise.resolve(replacement.playback));

    await coordinator.play("event-a", () => Promise.resolve(current.playback));
    const replacementResult = coordinator.play("event-b", startReplacement);
    await Promise.resolve();

    expect(current.stop).toHaveBeenCalledOnce();
    expect(startReplacement).not.toHaveBeenCalled();

    current.finish();
    await replacementResult;

    expect(startReplacement).toHaveBeenCalledOnce();
    expect(coordinator.activeEventId).toBe("event-b");
  });

  it("starts only the latest rapid replacement after the shared stop barrier", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const current = playbackDouble({ finishOnStop: false });
    const middle = playbackDouble();
    const latest = playbackDouble();
    const startMiddle = vi.fn(() => Promise.resolve(middle.playback));
    const startLatest = vi.fn(() => Promise.resolve(latest.playback));

    await coordinator.play("event-a", () => Promise.resolve(current.playback));
    const middleResult = coordinator
      .play("event-b", startMiddle)
      .catch((error: unknown) => error);
    await Promise.resolve();
    const latestResult = coordinator.play("event-c", startLatest);

    expect(await middleResult).toMatchObject({ name: "AbortError" });
    expect(current.stop).toHaveBeenCalledOnce();
    expect(startMiddle).not.toHaveBeenCalled();
    expect(startLatest).not.toHaveBeenCalled();

    current.finish();
    await latestResult;

    expect(startMiddle).not.toHaveBeenCalled();
    expect(middle.stop).not.toHaveBeenCalled();
    expect(startLatest).toHaveBeenCalledOnce();
    expect(coordinator.activeEventId).toBe("event-c");
  });

  it("cancels a replacement stopped while it waits for the current sound", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const current = playbackDouble({ finishOnStop: false });
    const replacement = playbackDouble();
    const startReplacement = vi.fn(() => Promise.resolve(replacement.playback));

    await coordinator.play("event-a", () => Promise.resolve(current.playback));
    const replacementResult = coordinator
      .play("event-b", startReplacement)
      .catch((error: unknown) => error);
    await Promise.resolve();

    coordinator.stopCurrent();
    expect(await replacementResult).toMatchObject({ name: "AbortError" });

    current.finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(current.stop).toHaveBeenCalledOnce();
    expect(startReplacement).not.toHaveBeenCalled();
    expect(coordinator.activeEventId).toBeNull();
  });

  it("stops a stale pending completion without replacing the latest sound", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const pending = deferred<SoundboardPlayback>();
    const stale = playbackDouble();
    const latest = playbackDouble();
    const firstResult = coordinator
      .play("event-a", () => pending.promise)
      .catch((error: unknown) => error);
    await Promise.resolve();

    await coordinator.play("event-b", () => Promise.resolve(latest.playback));
    expect(await firstResult).toMatchObject({ name: "AbortError" });

    pending.resolve(stale.playback);
    await vi.waitFor(() => expect(stale.stop).toHaveBeenCalledOnce());
    expect(latest.stop).not.toHaveBeenCalled();
    expect(coordinator.activeEventId).toBe("event-b");
  });

  it("cancels both pending and current playback", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const pending = deferred<SoundboardPlayback>();
    const stale = playbackDouble();
    const pendingResult = coordinator
      .play("event-pending", () => pending.promise)
      .catch((error: unknown) => error);
    await Promise.resolve();

    coordinator.stopCurrent();
    expect(await pendingResult).toMatchObject({ name: "AbortError" });
    pending.resolve(stale.playback);
    await vi.waitFor(() => expect(stale.stop).toHaveBeenCalledOnce());

    const current = playbackDouble();
    await coordinator.play("event-current", () =>
      Promise.resolve(current.playback),
    );
    coordinator.stopCurrent();

    expect(current.stop).toHaveBeenCalledOnce();
    expect(coordinator.activeEventId).toBeNull();
  });

  it("clears the current sound when playback ends naturally", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const current = playbackDouble();
    const onFinished = vi.fn();
    await coordinator.play(
      "event-a",
      () => Promise.resolve(current.playback),
      onFinished,
    );

    current.finish();
    await current.playback.finished;
    await Promise.resolve();

    expect(onFinished).toHaveBeenCalledWith("event-a");
    expect(current.stop).not.toHaveBeenCalled();
    expect(coordinator.activeEventId).toBeNull();
  });

  it("recovers after a start failure", async () => {
    const coordinator = new SoundboardPlaybackCoordinator();
    const failure = new Error("decoder gave up");

    await expect(
      coordinator.play("event-a", () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(coordinator.activeEventId).toBeNull();

    const recovered = playbackDouble();
    await coordinator.play("event-b", () =>
      Promise.resolve(recovered.playback),
    );
    expect(coordinator.activeEventId).toBe("event-b");
    expect(recovered.stop).not.toHaveBeenCalled();
  });
});

function playbackDouble({ finishOnStop = true } = {}) {
  let finish = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = vi.fn(() => {
    if (finishOnStop) finish();
  });
  return {
    finish,
    stop,
    playback: { finished, stop },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
