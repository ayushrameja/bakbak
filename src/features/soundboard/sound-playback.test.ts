import { describe, expect, it, vi } from "vitest";
import { SoundPlaybackController } from "./sound-playback";
import type { BundledSoundPlayback } from "./sounds";

function createPlayback(): BundledSoundPlayback {
  return {
    finished: new Promise(() => undefined),
    stop: vi.fn(),
  };
}

describe("SoundPlaybackController", () => {
  it("stops active sounds and suppresses new local rendering while deafened", () => {
    const first = createPlayback();
    const second = createPlayback();
    const player = vi.fn().mockReturnValueOnce(first).mockReturnValue(second);
    const controller = new SoundPlaybackController(player);

    expect(controller.play("airhorn", 0.72)).toBe(true);
    controller.setDeafened(true);

    expect(first.stop).toHaveBeenCalledOnce();
    expect(controller.play("rimshot", 0.72)).toBe(false);
    expect(player).toHaveBeenCalledOnce();

    controller.setDeafened(false);
    expect(player).toHaveBeenCalledOnce();
    expect(controller.play("rimshot", 0.72)).toBe(true);
    expect(player).toHaveBeenCalledTimes(2);
  });
});
