export interface RemoteAudioTrackLike {
  readonly kind: string;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element: HTMLMediaElement): HTMLMediaElement;
  setVolume?: (volume: number) => void;
}

/**
 * Owns the DOM elements used to render subscribed LiveKit audio tracks.
 * Keeping this boundary explicit makes teardown reliable when rooms change.
 */
export class RemoteAudioRenderer {
  private readonly elements = new Map<RemoteAudioTrackLike, HTMLAudioElement>();
  private muted = false;

  constructor(
    private readonly getHost: () => HTMLElement = () => document.body,
  ) {}

  attach(
    track: RemoteAudioTrackLike,
    volume?: number,
  ): HTMLAudioElement | null {
    if (track.kind !== "audio") return null;

    const existing = this.elements.get(track);
    if (existing) return existing;

    const element = document.createElement("audio");
    element.autoplay = true;
    element.hidden = true;
    element.muted = this.muted;
    element.dataset.bakbakRemoteAudio = "";

    track.attach(element);
    if (volume !== undefined) track.setVolume?.(volume);
    this.getHost().append(element);
    this.elements.set(track, element);
    return element;
  }

  setVolume(track: RemoteAudioTrackLike, volume: number): void {
    if (!this.elements.has(track)) return;
    track.setVolume?.(Math.max(0, Math.min(1, volume)));
  }

  detach(track: RemoteAudioTrackLike): void {
    const element = this.elements.get(track);
    if (!element) return;

    try {
      track.detach(element);
    } finally {
      element.remove();
      this.elements.delete(track);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.elements.forEach((element) => {
      element.muted = muted;
    });
  }

  cleanup(): void {
    [...this.elements.keys()].forEach((track) => {
      try {
        this.detach(track);
      } catch {
        // Best-effort teardown must continue for every remaining track.
      }
    });
    this.muted = false;
  }
}
