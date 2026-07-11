import { playBundledSound, type BundledSoundPlayback } from "./sounds";

type SoundPlayer = (
  soundId: string,
  volume?: number,
) => BundledSoundPlayback | null;

/** Coordinates every local soundboard render, regardless of event origin. */
export class SoundPlaybackController {
  private readonly active = new Set<BundledSoundPlayback>();
  private deafened = false;

  constructor(private readonly player: SoundPlayer = playBundledSound) {}

  play(soundId: string, volume?: number): boolean {
    if (this.deafened) return false;

    const playback = this.player(soundId, volume);
    if (!playback) return false;

    this.active.add(playback);
    void playback.finished.then(
      () => this.active.delete(playback),
      () => this.active.delete(playback),
    );
    return true;
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (deafened) this.stopAll();
  }

  stopAll(): void {
    this.active.forEach((playback) => playback.stop());
    this.active.clear();
  }
}
