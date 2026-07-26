export interface RemoteAudioTrackLike {
  readonly kind: string;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element: HTMLMediaElement): HTMLMediaElement;
}

export type RemoteAudioSourceKind = "speech" | "soundboard" | "screen-share";

export interface RemoteAudioAttachment {
  ownerId: string;
  sourceKind: RemoteAudioSourceKind;
  baseGain?: number;
}

interface OwnedRemoteAudio {
  element: HTMLAudioElement;
  metadata: Required<RemoteAudioAttachment>;
}

/**
 * Owns the DOM elements used to render subscribed LiveKit audio tracks.
 * Keeping this boundary explicit makes teardown reliable when rooms change.
 */
export class RemoteAudioRenderer {
  private readonly elements = new Map<RemoteAudioTrackLike, OwnedRemoteAudio>();
  private readonly mutedTracks = new Set<RemoteAudioTrackLike>();
  private readonly participantGains = new Map<string, number>();
  private readonly globalGains = new Map<RemoteAudioSourceKind, number>([
    ["speech", 1],
    ["soundboard", 1],
    ["screen-share", 1],
  ]);
  private muted = false;
  private selectedDeviceId = "default";

  constructor(
    private readonly getHost: () => HTMLElement = () => document.body,
  ) {}

  attach(
    track: RemoteAudioTrackLike,
    metadata: RemoteAudioAttachment,
  ): HTMLAudioElement | null {
    if (track.kind !== "audio") return null;

    const existing = this.elements.get(track);
    if (existing) return existing.element;

    const element = document.createElement("audio");
    element.autoplay = true;
    element.hidden = true;
    element.muted = this.muted || this.mutedTracks.has(track);
    element.dataset.bakbakRemoteAudio = "";
    if (
      this.selectedDeviceId !== "default" &&
      typeof element.setSinkId === "function"
    ) {
      void element.setSinkId(this.selectedDeviceId).catch(() => undefined);
    }

    track.attach(element);
    const owned = {
      element,
      metadata: {
        ...metadata,
        baseGain: clampGain(metadata.baseGain ?? 1),
      },
    };
    this.applyGain(owned);
    this.getHost().append(element);
    this.elements.set(track, owned);
    return element;
  }

  setParticipantGain(ownerId: string, gain: number): void {
    this.participantGains.set(ownerId, clampGain(gain));
    this.elements.forEach((owned) => {
      if (owned.metadata.ownerId === ownerId) this.applyGain(owned);
    });
  }

  setGlobalGain(sourceKind: RemoteAudioSourceKind, gain: number): void {
    this.globalGains.set(sourceKind, clampGain(gain));
    this.elements.forEach((owned) => {
      if (owned.metadata.sourceKind === sourceKind) this.applyGain(owned);
    });
  }

  detach(track: RemoteAudioTrackLike): void {
    const owned = this.elements.get(track);
    if (!owned) return;

    try {
      track.detach(owned.element);
    } finally {
      owned.element.remove();
      this.elements.delete(track);
      this.mutedTracks.delete(track);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.elements.forEach((owned, track) => {
      owned.element.muted = muted || this.mutedTracks.has(track);
    });
  }

  setTrackMuted(track: RemoteAudioTrackLike, muted: boolean): void {
    if (muted) this.mutedTracks.add(track);
    else this.mutedTracks.delete(track);
    const owned = this.elements.get(track);
    if (owned) owned.element.muted = this.muted || muted;
  }

  async setDevice(deviceId: string): Promise<void> {
    await Promise.all(
      [...this.elements.values()].map(async ({ element }) => {
        if (typeof element.setSinkId !== "function") {
          if (deviceId !== "default") {
            throw new Error("Audio output selection is not supported.");
          }
          return;
        }
        await element.setSinkId(deviceId);
      }),
    );
    this.selectedDeviceId = deviceId;
  }

  cleanup(): void {
    [...this.elements.keys()].forEach((track) => {
      try {
        this.detach(track);
      } catch {
        // Best-effort teardown must continue for every remaining track.
      }
    });
    this.mutedTracks.clear();
    this.muted = false;
  }

  private applyGain(owned: OwnedRemoteAudio): void {
    const participantGain =
      this.participantGains.get(owned.metadata.ownerId) ?? 1;
    const globalGain = this.globalGains.get(owned.metadata.sourceKind) ?? 1;
    owned.element.volume = clampGain(
      participantGain * globalGain * owned.metadata.baseGain,
    );
  }
}

function clampGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
