import {
  clampRemoteParticipantGain,
  RemoteAudioGainGraph,
  type RemoteAudioGainGraphOptions,
  type RemoteAudioGainStage,
} from "./remote-audio-gain";

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
  participantSid?: string;
  publicationSid?: string;
}

export type RemoteAudioPlaybackState =
  | "attached"
  | "playing"
  | "recovering"
  | "blocked"
  | "failed"
  | "stream-paused";

export type RemoteAudioHealthCode =
  | "playback-recovering"
  | "playback-restored"
  | "playback-blocked"
  | "playback-failed"
  | "stream-paused"
  | "stream-resumed";

export interface RemoteAudioHealthEvent {
  code: RemoteAudioHealthCode;
  participantSid: string | null;
  publicationSid: string | null;
  attempt: number;
  terminal: boolean;
}

export interface RemoteAudioDiagnostic {
  participantSid: string | null;
  publicationSid: string | null;
  sourceKind: RemoteAudioSourceKind;
  playbackState: RemoteAudioPlaybackState;
  mediaPaused: boolean;
  mediaEnded: boolean;
  mediaReadyState: number;
  recoveryAttempts: number;
  lastEvent: string;
  listenerGain: number;
  limitedOutput: boolean;
}

interface OwnedRemoteAudio {
  element: HTMLAudioElement;
  metadata: {
    ownerId: string;
    sourceKind: RemoteAudioSourceKind;
    baseGain: number;
    participantSid: string | null;
    publicationSid: string | null;
  };
  playbackState: RemoteAudioPlaybackState;
  recoveryAttempts: number;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
  recoveryPending: Promise<boolean> | null;
  lastEvent: string;
  removeHealthListeners: () => void;
  gainStage: RemoteAudioGainStage | null;
}

const MAX_PLAYBACK_RECOVERY_ATTEMPTS = 2;
const PLAYBACK_RECOVERY_DELAY_MS = 250;

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
  private healthListener: ((event: RemoteAudioHealthEvent) => void) | null =
    null;
  private readonly gainGraph: RemoteAudioGainGraph;

  constructor(
    private readonly getHost: () => HTMLElement = () => document.body,
    gainGraphOptions: RemoteAudioGainGraphOptions = {},
  ) {
    this.gainGraph = new RemoteAudioGainGraph({
      ...gainGraphOptions,
      getHost: gainGraphOptions.getHost ?? getHost,
    });
  }

  setHealthListener(
    listener: ((event: RemoteAudioHealthEvent) => void) | null,
  ): void {
    this.healthListener = listener;
  }

  attach(
    track: RemoteAudioTrackLike,
    metadata: RemoteAudioAttachment,
  ): HTMLAudioElement | null {
    if (track.kind !== "audio") return null;

    const existing = this.elements.get(track);
    if (existing) {
      existing.metadata = normalizeMetadata(metadata);
      this.applyGain(existing);
      if (!existing.element.parentNode) this.getHost().append(existing.element);
      return existing.element;
    }

    const element = document.createElement("audio");
    element.autoplay = true;
    element.hidden = true;
    element.muted = this.muted || this.mutedTracks.has(track);
    element.dataset.bakbakRemoteAudio = "";

    const owned: OwnedRemoteAudio = {
      element,
      metadata: normalizeMetadata(metadata),
      playbackState: "attached",
      recoveryAttempts: 0,
      recoveryTimer: null,
      recoveryPending: null,
      lastEvent: "attached",
      removeHealthListeners: () => undefined,
      gainStage: this.gainGraph.attach(element),
    };
    if (
      !owned.gainStage &&
      this.selectedDeviceId !== "default" &&
      typeof element.setSinkId === "function"
    ) {
      void element.setSinkId(this.selectedDeviceId).catch(() => undefined);
    }
    owned.removeHealthListeners = this.addHealthListeners(track, owned);
    this.applyGain(owned);
    this.getHost().append(element);
    this.elements.set(track, owned);
    try {
      track.attach(element);
    } catch {
      this.emitHealth(owned, "playback-failed", true);
      this.detach(track);
      return null;
    }
    void this.gainGraph.start().then((started) => {
      if (started || this.elements.get(track) !== owned) return;
      owned.playbackState = "blocked";
      owned.lastEvent = "output-autoplay-blocked";
      this.emitHealth(owned, "playback-blocked", false);
    });
    return element;
  }

  setParticipantGain(ownerId: string, gain: number): void {
    this.participantGains.set(ownerId, clampRemoteParticipantGain(gain));
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

    if (owned.recoveryTimer !== null) clearTimeout(owned.recoveryTimer);
    owned.removeHealthListeners();
    try {
      track.detach(owned.element);
    } finally {
      owned.gainStage?.disconnect();
      owned.element.remove();
      this.elements.delete(track);
      this.mutedTracks.delete(track);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.elements.forEach((owned, track) => {
      owned.element.muted = muted || this.mutedTracks.has(track);
      this.applyGain(owned);
    });
  }

  setTrackMuted(track: RemoteAudioTrackLike, muted: boolean): void {
    if (muted) this.mutedTracks.add(track);
    else this.mutedTracks.delete(track);
    const owned = this.elements.get(track);
    if (owned) {
      owned.element.muted = this.muted || muted;
      this.applyGain(owned);
    }
  }

  async setDevice(deviceId: string): Promise<void> {
    const graphRouted = await this.gainGraph.setDevice(deviceId);
    await Promise.all(
      [...this.elements.values()].map(async ({ element, gainStage }) => {
        if (graphRouted && gainStage) return;
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

  detachExcept(tracks: ReadonlySet<RemoteAudioTrackLike>): void {
    [...this.elements.keys()].forEach((track) => {
      if (!tracks.has(track)) this.detach(track);
    });
  }

  detachByPublicationSid(publicationSid: string): void {
    [...this.elements.entries()].forEach(([track, owned]) => {
      if (owned.metadata.publicationSid === publicationSid) this.detach(track);
    });
  }

  setStreamState(track: RemoteAudioTrackLike, state: string): void {
    const owned = this.elements.get(track);
    if (!owned) return;
    owned.lastEvent = `stream-${state}`;
    if (state === "paused") {
      owned.playbackState = "stream-paused";
      this.emitHealth(owned, "stream-paused", false);
      return;
    }
    if (state === "active") {
      this.emitHealth(owned, "stream-resumed", false);
      void this.recover(track, "stream-resumed");
    }
  }

  async recover(
    track: RemoteAudioTrackLike,
    trigger = "manual",
  ): Promise<boolean> {
    const owned = this.elements.get(track);
    if (!owned) return false;
    if (owned.recoveryPending) return owned.recoveryPending;

    owned.recoveryPending = this.attemptPlayback(track, owned, trigger).finally(
      () => {
        const current = this.elements.get(track);
        if (current === owned) current.recoveryPending = null;
      },
    );
    return owned.recoveryPending;
  }

  async recoverAll(trigger = "manual"): Promise<boolean> {
    const results = await Promise.all(
      [...this.elements.keys()].map((track) => this.recover(track, trigger)),
    );
    return results.every(Boolean);
  }

  hasPlaybackFailures(): boolean {
    return [...this.elements.values()].some(
      ({ playbackState }) => playbackState === "failed",
    );
  }

  diagnostics(): RemoteAudioDiagnostic[] {
    return [...this.elements.values()].map((owned) => ({
      participantSid: owned.metadata.participantSid,
      publicationSid: owned.metadata.publicationSid,
      sourceKind: owned.metadata.sourceKind,
      playbackState: owned.playbackState,
      mediaPaused: owned.element.paused,
      mediaEnded: owned.element.ended,
      mediaReadyState: owned.element.readyState,
      recoveryAttempts: owned.recoveryAttempts,
      lastEvent: owned.lastEvent,
      listenerGain: this.resolveGain(owned),
      limitedOutput: Boolean(owned.gainStage),
    }));
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
    this.gainGraph.cleanup();
  }

  private addHealthListeners(
    track: RemoteAudioTrackLike,
    owned: OwnedRemoteAudio,
  ): () => void {
    const onPlaying = () => {
      const wasRecovering =
        owned.playbackState !== "playing" && owned.playbackState !== "attached";
      owned.playbackState = "playing";
      owned.recoveryAttempts = 0;
      owned.lastEvent = "playing";
      if (owned.recoveryTimer !== null) {
        clearTimeout(owned.recoveryTimer);
        owned.recoveryTimer = null;
      }
      if (wasRecovering) {
        this.emitHealth(owned, "playback-restored", false);
      }
    };
    const recover = (event: string) => {
      if (!this.elements.has(track)) return;
      owned.lastEvent = event;
      void this.recover(track, event);
    };
    const onPause = () => recover("pause");
    const onStalled = () => recover("stalled");
    const onError = () => recover("error");
    const onEnded = () => recover("ended");

    owned.element.addEventListener("playing", onPlaying);
    owned.element.addEventListener("pause", onPause);
    owned.element.addEventListener("stalled", onStalled);
    owned.element.addEventListener("error", onError);
    owned.element.addEventListener("ended", onEnded);
    return () => {
      owned.element.removeEventListener("playing", onPlaying);
      owned.element.removeEventListener("pause", onPause);
      owned.element.removeEventListener("stalled", onStalled);
      owned.element.removeEventListener("error", onError);
      owned.element.removeEventListener("ended", onEnded);
    };
  }

  private async attemptPlayback(
    track: RemoteAudioTrackLike,
    owned: OwnedRemoteAudio,
    trigger: string,
  ): Promise<boolean> {
    if (this.elements.get(track) !== owned) return false;
    if (owned.recoveryAttempts >= MAX_PLAYBACK_RECOVERY_ATTEMPTS) {
      owned.playbackState = "failed";
      owned.lastEvent = `${trigger}-exhausted`;
      this.emitHealth(owned, "playback-failed", true);
      return false;
    }

    owned.recoveryAttempts += 1;
    owned.playbackState = "recovering";
    owned.lastEvent = trigger;
    this.emitHealth(owned, "playback-recovering", false);

    try {
      if (
        trigger === "error" ||
        trigger === "ended" ||
        Boolean(owned.element.error)
      ) {
        track.detach(owned.element);
        track.attach(owned.element);
      }
      await Promise.resolve(owned.element.play());
      if (!(await this.gainGraph.start())) {
        throw new DOMException("gesture required", "NotAllowedError");
      }
      if (this.elements.get(track) !== owned) return false;
      const alreadyReportedPlaying = owned.lastEvent === "playing";
      owned.playbackState = "playing";
      owned.recoveryAttempts = 0;
      owned.lastEvent = "play-resolved";
      if (!alreadyReportedPlaying) {
        this.emitHealth(owned, "playback-restored", false);
      }
      return true;
    } catch (error) {
      if (this.elements.get(track) !== owned) return false;
      if (isAutoplayBlock(error)) {
        owned.playbackState = "blocked";
        owned.lastEvent = "autoplay-blocked";
        this.emitHealth(owned, "playback-blocked", false);
        return false;
      }
      if (owned.recoveryAttempts < MAX_PLAYBACK_RECOVERY_ATTEMPTS) {
        owned.recoveryTimer = setTimeout(() => {
          owned.recoveryTimer = null;
          void this.recover(track, `${trigger}-retry`);
        }, PLAYBACK_RECOVERY_DELAY_MS);
        return false;
      }
      owned.playbackState = "failed";
      owned.lastEvent = `${trigger}-failed`;
      this.emitHealth(owned, "playback-failed", true);
      return false;
    }
  }

  private emitHealth(
    owned: OwnedRemoteAudio,
    code: RemoteAudioHealthCode,
    terminal: boolean,
  ): void {
    this.healthListener?.({
      code,
      participantSid: owned.metadata.participantSid,
      publicationSid: owned.metadata.publicationSid,
      attempt: owned.recoveryAttempts,
      terminal,
    });
  }

  private applyGain(owned: OwnedRemoteAudio): void {
    const gain = this.resolveGain(owned);
    if (owned.gainStage) {
      owned.element.volume = 1;
      owned.gainStage.setGain(gain);
      return;
    }
    owned.element.volume = clampGain(gain);
  }

  private resolveGain(owned: OwnedRemoteAudio): number {
    const participantGain =
      this.participantGains.get(owned.metadata.ownerId) ?? 1;
    const globalGain = this.globalGains.get(owned.metadata.sourceKind) ?? 1;
    return this.muted || owned.element.muted
      ? 0
      : participantGain * globalGain * owned.metadata.baseGain;
  }
}

function normalizeMetadata(metadata: RemoteAudioAttachment) {
  return {
    ownerId: metadata.ownerId,
    sourceKind: metadata.sourceKind,
    baseGain: clampGain(metadata.baseGain ?? 1),
    participantSid: metadata.participantSid ?? null,
    publicationSid: metadata.publicationSid ?? null,
  };
}

function isAutoplayBlock(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "NotAllowedError"
    : error instanceof Error && error.name === "NotAllowedError";
}

function clampGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
