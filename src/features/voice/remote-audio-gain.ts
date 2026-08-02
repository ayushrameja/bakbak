export const MAX_REMOTE_PARTICIPANT_GAIN = 2;
export const REMOTE_AUDIO_OUTPUT_CEILING = 0.98;

const LIMITER_THRESHOLD = 0.9;
const LIMITER_CURVE_POINTS = 65_536;

export type RemoteAudioContextConstructor = new () => AudioContext;

export interface RemoteAudioGainStage {
  readonly gain: number;
  /**
   * True when Web Audio reads the MediaStream directly. The companion media
   * element must stay muted in that case so the same participant is not heard
   * once through the element and again through the limited mix.
   */
  readonly isolatesElementPlayback: boolean;
  setGain(gain: number): void;
  disconnect(): void;
}

export interface RemoteAudioGainGraphOptions {
  contextConstructor?: RemoteAudioContextConstructor | null;
  createOutputElement?: () => HTMLAudioElement;
  getHost?: () => HTMLElement;
}

export class RemoteAudioGainGraph {
  readonly supported: boolean;
  private readonly Context: RemoteAudioContextConstructor | null;
  private readonly createOutputElement: () => HTMLAudioElement;
  private readonly getHost: () => HTMLElement;
  private context: AudioContext | null = null;
  private limiter: WaveShaperNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private output: HTMLAudioElement | null = null;
  private selectedDeviceId = "default";
  private failed = false;
  private startPending: Promise<boolean> | null = null;

  constructor(options: RemoteAudioGainGraphOptions = {}) {
    const audioWindow =
      typeof window === "undefined"
        ? null
        : (window as typeof window & {
            webkitAudioContext?: RemoteAudioContextConstructor;
          });
    const detectedContext =
      audioWindow?.AudioContext ?? audioWindow?.webkitAudioContext ?? null;
    this.Context =
      "contextConstructor" in options
        ? (options.contextConstructor ?? null)
        : detectedContext;
    this.supported = this.Context !== null;
    this.createOutputElement =
      options.createOutputElement ?? (() => document.createElement("audio"));
    this.getHost = options.getHost ?? (() => document.body);
  }

  attach(element: HTMLAudioElement): RemoteAudioGainStage | null {
    const graph = this.ensureGraph();
    if (!graph) return null;
    let source: AudioNode | null = null;
    let gainNode: GainNode | null = null;
    try {
      const stream = readAttachedMediaStream(element);
      let isolatesElementPlayback = false;
      if (
        stream !== null &&
        typeof graph.context.createMediaStreamSource === "function"
      ) {
        try {
          source = graph.context.createMediaStreamSource(stream);
          isolatesElementPlayback = true;
        } catch {
          // Some embedded engines expose the API but reject remote streams.
          // The element-backed graph remains a valid limited route.
        }
      }
      source ??= graph.context.createMediaElementSource(element);
      gainNode = graph.context.createGain();
      source.connect(gainNode);
      gainNode.connect(graph.limiter);
      return new BrowserRemoteAudioGainStage(
        source,
        gainNode,
        isolatesElementPlayback,
      );
    } catch {
      source?.disconnect();
      gainNode?.disconnect();
      return null;
    }
  }

  async setDevice(deviceId: string): Promise<boolean> {
    const graph = this.ensureGraph();
    if (!graph) {
      this.selectedDeviceId = deviceId;
      return false;
    }
    if (typeof graph.output.setSinkId !== "function") {
      if (deviceId !== "default") {
        throw new Error("Audio output selection is not supported.");
      }
    } else {
      await graph.output.setSinkId(deviceId);
    }
    this.selectedDeviceId = deviceId;
    await this.start();
    return true;
  }

  async start(): Promise<boolean> {
    if (this.startPending) return this.startPending;
    const graph = this.currentGraph();
    if (!graph) return !this.supported || this.failed;
    const request = (async () => {
      try {
        if (graph.context.state === "suspended") await graph.context.resume();
        await Promise.resolve(graph.output.play());
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      if (this.startPending === request) this.startPending = null;
    });
    this.startPending = request;
    return request;
  }

  cleanup(): void {
    const context = this.context;
    const limiter = this.limiter;
    const destination = this.destination;
    const output = this.output;
    this.context = null;
    this.limiter = null;
    this.destination = null;
    this.output = null;
    this.failed = false;
    this.startPending = null;

    limiter?.disconnect();
    if (output) {
      output.muted = true;
      output.pause();
      output.srcObject = null;
      output.remove();
    }
    destination?.stream.getTracks().forEach((track) => track.stop());
    void context?.close().catch(() => undefined);
  }

  private ensureGraph(): {
    context: AudioContext;
    limiter: WaveShaperNode;
    output: HTMLAudioElement;
  } | null {
    const current = this.currentGraph();
    if (current) return current;
    if (!this.Context || this.failed) return null;

    let context: AudioContext | null = null;
    let limiter: WaveShaperNode | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    let output: HTMLAudioElement | null = null;
    try {
      context = new this.Context();
      limiter = context.createWaveShaper();
      limiter.curve = createRemoteAudioLimiterCurve();
      limiter.oversample = "4x";
      destination = context.createMediaStreamDestination();
      limiter.connect(destination);

      output = this.createOutputElement();
      output.autoplay = true;
      output.hidden = true;
      output.srcObject = destination.stream;
      output.dataset.bakbakRemoteAudioOutput = "";
      this.getHost().append(output);

      this.context = context;
      this.limiter = limiter;
      this.destination = destination;
      this.output = output;
      if (
        this.selectedDeviceId !== "default" &&
        typeof output.setSinkId === "function"
      ) {
        void output.setSinkId(this.selectedDeviceId).catch(() => undefined);
      }
      return { context, limiter, output };
    } catch {
      limiter?.disconnect();
      if (output) {
        output.muted = true;
        output.pause();
        output.srcObject = null;
        output.remove();
      }
      destination?.stream.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => undefined);
      this.failed = true;
      return null;
    }
  }

  private currentGraph(): {
    context: AudioContext;
    limiter: WaveShaperNode;
    output: HTMLAudioElement;
  } | null {
    return this.context && this.limiter && this.output
      ? {
          context: this.context,
          limiter: this.limiter,
          output: this.output,
        }
      : null;
  }
}

class BrowserRemoteAudioGainStage implements RemoteAudioGainStage {
  private currentGain = 1;
  private connected = true;

  constructor(
    private readonly source: AudioNode,
    private readonly node: GainNode,
    readonly isolatesElementPlayback: boolean,
  ) {}

  get gain(): number {
    return this.currentGain;
  }

  setGain(gain: number): void {
    this.currentGain = clampRemoteGain(gain);
    this.node.gain.value = this.currentGain;
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.source.disconnect();
    this.node.disconnect();
  }
}

function readAttachedMediaStream(
  element: HTMLAudioElement,
): MediaStream | null {
  const source = element.srcObject;
  return source && typeof (source as MediaStream).getAudioTracks === "function"
    ? (source as MediaStream)
    : null;
}

export function clampRemoteParticipantGain(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_REMOTE_PARTICIPANT_GAIN, value))
    : 1;
}

export function limitRemoteAudioSample(sample: number): number {
  if (!Number.isFinite(sample) || sample === 0) return 0;
  const sign = Math.sign(sample);
  const magnitude = Math.min(1, Math.abs(sample));
  if (magnitude <= LIMITER_THRESHOLD) return sample;
  const normalized = (magnitude - LIMITER_THRESHOLD) / (1 - LIMITER_THRESHOLD);
  const softened = 1 - Math.pow(1 - normalized, 2);
  return (
    sign *
    (LIMITER_THRESHOLD +
      (REMOTE_AUDIO_OUTPUT_CEILING - LIMITER_THRESHOLD) * softened)
  );
}

export function createRemoteAudioLimiterCurve(): Float32Array {
  const curve = new Float32Array(LIMITER_CURVE_POINTS);
  for (let index = 0; index < curve.length; index += 1) {
    const sample = (index / (curve.length - 1)) * 2 - 1;
    curve[index] = limitRemoteAudioSample(sample);
  }
  return curve;
}

function clampRemoteGain(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_REMOTE_PARTICIPANT_GAIN, value))
    : 1;
}
