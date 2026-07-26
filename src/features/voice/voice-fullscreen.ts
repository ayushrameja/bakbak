export interface MacosFullscreenWindow {
  setSimpleFullscreen(fullscreen: boolean): Promise<void>;
  clearEffects(): Promise<void>;
  setEffects(effects: unknown): Promise<void>;
}

export interface FullscreenStageRoot {
  dataset: DOMStringMap;
  removeAttribute(name: string): void;
}

export const FULLSCREEN_TRANSITION_TIMEOUT_MS = 4_000;

export function isMacosVoiceFullscreen(userAgent: string): boolean {
  return /mac os x|macintosh/i.test(userAgent);
}

export async function setMacosMediaFullscreen(
  window: MacosFullscreenWindow,
  root: FullscreenStageRoot,
  fullscreen: boolean,
  restoreEffects: unknown,
  timeoutMs = FULLSCREEN_TRANSITION_TIMEOUT_MS,
): Promise<void> {
  if (fullscreen) {
    root.dataset.voiceMediaStage = "opaque";
    let entered = false;
    try {
      await window.clearEffects();
      await withTimeoutAndLateRollback(
        window.setSimpleFullscreen(true),
        () => window.setSimpleFullscreen(false),
        timeoutMs,
      );
      entered = true;
    } finally {
      if (!entered) {
        await window.setSimpleFullscreen(false).catch(() => undefined);
        await window.setEffects(restoreEffects).catch(() => undefined);
        root.removeAttribute("data-voice-media-stage");
      }
    }
    return;
  }

  try {
    await withTimeoutAndLateRollback(
      window.setSimpleFullscreen(false),
      () => window.setSimpleFullscreen(false),
      timeoutMs,
    );
  } finally {
    await window.setEffects(restoreEffects).catch(() => undefined);
    root.removeAttribute("data-voice-media-stage");
  }
}

export function enqueueFullscreenTransition(
  queue: { current: Promise<void> },
  transition: () => Promise<void>,
): Promise<void> {
  const next = queue.current.catch(() => undefined).then(transition);
  queue.current = next.catch(() => undefined);
  return next;
}

async function withTimeoutAndLateRollback(
  operation: Promise<void>,
  rollback: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timedOut = false;
  const timer = new Promise<never>((_, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      reject(new Error("Fullscreen transition timed out."));
    }, timeoutMs);
    void operation.then(
      () => globalThis.clearTimeout(timeoutId),
      () => globalThis.clearTimeout(timeoutId),
    );
  });
  try {
    await Promise.race([operation, timer]);
  } catch (error) {
    if (timedOut) {
      void operation.then(rollback, () => undefined);
    }
    throw error;
  }
}
