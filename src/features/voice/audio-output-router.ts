import type { SoundAudioTarget } from "../soundboard/soundboard-audio";

export type AudioContextConstructor = new () => AudioContext;

export interface AudioOutputRouterOptions {
  contextConstructor?: AudioContextConstructor | null;
  outputSelectionSupported?: boolean;
  createAudioElement?: () => HTMLAudioElement;
  getHost?: () => HTMLElement;
}

export class AudioOutputRouter {
  readonly supported: boolean;
  private readonly Context: AudioContextConstructor | null;
  private context: AudioContext | null = null;
  private element: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;
  private target: SoundAudioTarget | null = null;
  private selectedDeviceId = "default";
  private readonly createAudioElement: () => HTMLAudioElement;
  private readonly getHost: () => HTMLElement;

  constructor(options: AudioOutputRouterOptions = {}) {
    const audioWindow =
      typeof window === "undefined"
        ? null
        : (window as typeof window & {
            webkitAudioContext?: AudioContextConstructor;
          });
    const detectedContext =
      audioWindow?.AudioContext ?? audioWindow?.webkitAudioContext ?? null;
    this.Context =
      "contextConstructor" in options
        ? (options.contextConstructor ?? null)
        : detectedContext;
    this.supported =
      options.outputSelectionSupported ??
      (this.Context !== null &&
        typeof HTMLMediaElement !== "undefined" &&
        "setSinkId" in HTMLMediaElement.prototype);
    this.createAudioElement =
      options.createAudioElement ?? (() => document.createElement("audio"));
    this.getHost = options.getHost ?? (() => document.body);
  }

  get soundTarget(): SoundAudioTarget | null {
    this.ensureRoutingGraph();
    return this.target;
  }

  get deviceId(): string {
    return this.selectedDeviceId;
  }

  async setDevice(deviceId: string): Promise<void> {
    if (!this.supported) {
      throw new Error("Audio output selection is not supported.");
    }
    this.ensureRoutingGraph();
    if (!this.element) throw new Error("Audio output routing is unavailable.");
    await this.element.setSinkId(deviceId);
    this.selectedDeviceId = deviceId;
    await this.start();
  }

  async start(): Promise<void> {
    this.ensureRoutingGraph();
    if (this.context?.state === "suspended") await this.context.resume();
    if (this.element) {
      if (this.element.sinkId !== this.selectedDeviceId) {
        await this.element.setSinkId(this.selectedDeviceId);
      }
      await this.element.play();
    }
  }

  cleanup(): void {
    const context = this.context;
    this.context = null;
    this.target = null;
    this.releaseMonitor();
    void context?.close().catch(() => undefined);
  }

  resetMonitor(): void {
    if (!this.supported) return;
    this.target = null;
    this.releaseMonitor();
  }

  private ensureRoutingGraph(): void {
    if (this.target || !this.Context) return;
    const context = this.context ?? new this.Context();
    if (!this.supported) {
      this.context = context;
      this.target = { context, destination: context.destination };
      return;
    }
    const destination = context.createMediaStreamDestination();
    const element = this.createAudioElement();
    element.autoplay = true;
    element.hidden = true;
    element.srcObject = destination.stream;
    element.dataset.bakbakSoundOutput = "";
    this.getHost().append(element);
    this.context = context;
    this.element = element;
    this.stream = destination.stream;
    this.target = { context, destination };
  }

  private releaseMonitor(): void {
    const element = this.element;
    const stream = this.stream;
    this.element = null;
    this.stream = null;

    if (element) {
      element.muted = true;
      element.volume = 0;
      element.pause();
    }
    stream?.getTracks().forEach((track) => track.stop());
    if (element) element.srcObject = null;
    element?.remove();
  }
}
