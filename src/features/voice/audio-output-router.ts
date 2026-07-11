import type { SoundAudioTarget } from "../soundboard/sounds";

type AudioContextConstructor = new () => AudioContext;

export class AudioOutputRouter {
  readonly supported: boolean;
  private readonly Context: AudioContextConstructor | null;
  private context: AudioContext | null = null;
  private element: HTMLAudioElement | null = null;
  private target: SoundAudioTarget | null = null;
  private selectedDeviceId = "default";

  constructor() {
    const audioWindow =
      typeof window === "undefined"
        ? null
        : (window as typeof window & {
            webkitAudioContext?: AudioContextConstructor;
          });
    this.Context =
      audioWindow?.AudioContext ?? audioWindow?.webkitAudioContext ?? null;
    this.supported =
      this.Context !== null &&
      typeof HTMLMediaElement !== "undefined" &&
      "setSinkId" in HTMLMediaElement.prototype;
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
    if (this.element) await this.element.play();
  }

  cleanup(): void {
    this.element?.remove();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.element = null;
    this.target = null;
  }

  private ensureRoutingGraph(): void {
    if (this.target || !this.supported || !this.Context) return;
    const context = new this.Context();
    const destination = context.createMediaStreamDestination();
    const element = document.createElement("audio");
    element.autoplay = true;
    element.hidden = true;
    element.srcObject = destination.stream;
    element.dataset.bakbakSoundOutput = "";
    document.body.append(element);
    this.context = context;
    this.element = element;
    this.target = { context, destination };
  }
}
