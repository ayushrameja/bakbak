import {
  playBundledSound,
  type BundledSoundPlayback,
  type SoundAudioTarget,
} from "./sounds";

type SoundPlayer = (
  soundId: string,
  volume?: number,
  target?: SoundAudioTarget | null,
) => BundledSoundPlayback | null;

/** Coordinates every local soundboard render, regardless of event origin. */
export class SoundPlaybackController {
  private readonly active = new Set<BundledSoundPlayback>();
  private deafened = false;

  constructor(
    private readonly player: SoundPlayer = playBundledSound,
    private readonly target:
      SoundAudioTarget | null | (() => SoundAudioTarget | null) = null,
  ) {}

  play(soundId: string, volume?: number): boolean {
    if (this.deafened) return false;

    const playback = this.player(
      soundId,
      volume,
      typeof this.target === "function" ? this.target() : this.target,
    );
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
