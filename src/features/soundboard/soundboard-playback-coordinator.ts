import type { SoundboardPlayback } from "./soundboard-audio";

export interface SoundboardPlaybackAttempt {
  signal: AbortSignal;
  throwIfCancelled: () => void;
}

export type StartSoundboardPlayback = (
  attempt: SoundboardPlaybackAttempt,
) => Promise<SoundboardPlayback>;

export class SoundboardPlaybackCoordinator {
  private operation = 0;
  private pending: { operation: number; controller: AbortController } | null =
    null;
  private active: {
    operation: number;
    eventId: string;
    playback: SoundboardPlayback;
  } | null = null;
  private replacementStopBarrier: Promise<void> | null = null;

  get activeEventId(): string | null {
    return this.active?.eventId ?? null;
  }

  async play(
    eventId: string,
    start: StartSoundboardPlayback,
    onFinished: (eventId: string) => void = () => {},
  ): Promise<SoundboardPlayback> {
    const operation = ++this.operation;
    this.cancelPending();
    const replacementStopBarrier = this.stopActive();

    const controller = new AbortController();
    this.pending = { operation, controller };
    const throwIfCancelled = () => {
      if (
        controller.signal.aborted ||
        operation !== this.operation ||
        this.pending?.operation !== operation
      ) {
        throw playbackCancelled();
      }
    };
    const attempt: SoundboardPlaybackAttempt = {
      signal: controller.signal,
      throwIfCancelled,
    };

    const startPromise = replacementStopBarrier.then(() => {
      throwIfCancelled();
      return start(attempt);
    });
    const guardedStart = startPromise.then((playback) => {
      try {
        throwIfCancelled();
        return playback;
      } catch (error) {
        playback.stop();
        throw error;
      }
    });

    let playback: SoundboardPlayback;
    try {
      playback = await Promise.race([
        guardedStart,
        cancellationPromise(controller.signal),
      ]);
    } catch (error) {
      if (this.pending?.operation === operation) this.pending = null;
      if (controller.signal.aborted || operation !== this.operation) {
        throw playbackCancelled();
      }
      throw error;
    }

    try {
      throwIfCancelled();
    } catch (error) {
      playback.stop();
      throw error;
    }
    this.pending = null;
    this.active = { operation, eventId, playback };
    void playback.finished.then(
      () => this.finishActive(operation, playback, onFinished),
      () => this.finishActive(operation, playback, onFinished),
    );
    return playback;
  }

  stopCurrent(): void {
    this.operation += 1;
    this.cancelPending();
    void this.stopActive();
  }

  private cancelPending(): void {
    this.pending?.controller.abort();
    this.pending = null;
  }

  private stopActive(): Promise<void> {
    const active = this.active;
    this.active = null;
    if (!active) {
      return this.replacementStopBarrier ?? Promise.resolve();
    }

    active.playback.stop();
    const barrier = active.playback.finished.then(
      () => undefined,
      () => undefined,
    );
    this.replacementStopBarrier = barrier;
    void barrier.then(() => {
      if (this.replacementStopBarrier === barrier) {
        this.replacementStopBarrier = null;
      }
    });
    return barrier;
  }

  private finishActive(
    operation: number,
    playback: SoundboardPlayback,
    onFinished: (eventId: string) => void,
  ): void {
    if (
      this.active?.operation !== operation ||
      this.active.playback !== playback
    ) {
      return;
    }
    const { eventId } = this.active;
    this.active = null;
    onFinished(eventId);
  }
}

function cancellationPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(playbackCancelled());
      return;
    }
    signal.addEventListener("abort", () => reject(playbackCancelled()), {
      once: true,
    });
  });
}

function playbackCancelled(): DOMException {
  return new DOMException("Sound playback was stopped.", "AbortError");
}
