import type {
  ExternalAudioDesktopApi,
  ExternalAudioSetupRecording,
  ExternalAudioSetupTestConfig,
  ExternalAudioSessionConfig,
  ExternalAudioSessionStatus,
  ExternalAudioSessionState,
} from "../../lib/external-audio-types";
import {
  EXTERNAL_AUDIO_SAMPLE_RATE,
  audioBufferToExternalPcm,
} from "./external-audio-pcm";

interface AudioDecoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  close?(): Promise<void>;
}

export function externalAudioBlocksVoice(
  status: ExternalAudioSessionStatus,
): boolean {
  return (
    status === "starting" ||
    status === "testing" ||
    status === "live" ||
    status === "stopping"
  );
}

export class ExternalAudioController {
  private playbackGeneration = 0;

  constructor(
    private readonly api: ExternalAudioDesktopApi,
    private readonly createDecoder: () => AudioDecoder = () =>
      new AudioContext({ sampleRate: EXTERNAL_AUDIO_SAMPLE_RATE }),
  ) {}

  async start(
    config: ExternalAudioSessionConfig,
  ): Promise<ExternalAudioSessionState> {
    validateConfig(config);
    this.playbackGeneration += 1;
    return this.api.start(config);
  }

  async startSetupTest(
    config: ExternalAudioSetupTestConfig,
  ): Promise<ExternalAudioSessionState> {
    if (!config.microphoneDeviceId) {
      throw new Error("Choose a physical microphone before testing.");
    }
    this.playbackGeneration += 1;
    return this.api.startSetupTest(config);
  }

  clearSetupRecording(): Promise<void> {
    return this.api.clearSetupRecording();
  }

  captureSetupRecording(): Promise<ExternalAudioSetupRecording> {
    return this.api.captureSetupRecording();
  }

  playSetupTone(): Promise<ExternalAudioSessionState> {
    return this.api.playSetupTone();
  }

  playSetupRecording(
    recording: ExternalAudioSetupRecording,
  ): Promise<ExternalAudioSessionState> {
    if (
      recording.sampleRate !== EXTERNAL_AUDIO_SAMPLE_RATE ||
      recording.samples.length === 0 ||
      recording.samples.length > EXTERNAL_AUDIO_SAMPLE_RATE * 2
    ) {
      throw new Error("The local microphone test recording is invalid.");
    }
    return this.api.playSetupRecording(recording);
  }

  async stopSetupTest(): Promise<ExternalAudioSessionState> {
    this.playbackGeneration += 1;
    return this.api.stopSetupTest();
  }

  async play(soundId: string, blob: Blob): Promise<ExternalAudioSessionState> {
    return this.playFromLoader(soundId, () => Promise.resolve(blob));
  }

  async playFromLoader(
    soundId: string,
    loadBlob: () => Promise<Blob | null>,
  ): Promise<ExternalAudioSessionState> {
    if (!soundId || soundId.length > 128) {
      throw new Error("That sound identifier is invalid.");
    }
    const generation = this.playbackGeneration + 1;
    this.playbackGeneration = generation;
    const state = await this.api.getState();
    if (generation !== this.playbackGeneration) throw cancelled();
    if (state.status !== "live") {
      throw new Error("Start External Soundboard before playing a sound.");
    }

    await this.api.stopSound();
    if (generation !== this.playbackGeneration) throw cancelled();
    const blob = await loadBlob();
    if (generation !== this.playbackGeneration) throw cancelled();
    if (!blob) throw new Error("That sound is not ready on this device.");
    const decoder = this.createDecoder();
    try {
      const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
      if (generation !== this.playbackGeneration) throw cancelled();
      return await this.api.play({
        soundId,
        sampleRate: EXTERNAL_AUDIO_SAMPLE_RATE,
        samples: audioBufferToExternalPcm(decoded),
      });
    } finally {
      await decoder.close?.().catch(() => undefined);
    }
  }

  async stopSound(): Promise<ExternalAudioSessionState> {
    this.playbackGeneration += 1;
    return this.api.stopSound();
  }

  async stop(): Promise<ExternalAudioSessionState> {
    this.playbackGeneration += 1;
    return this.api.stop();
  }
}

function validateConfig(config: ExternalAudioSessionConfig): void {
  if (!config.microphoneDeviceId || !config.cableOutputDeviceId) {
    throw new Error("Choose a microphone and virtual cable output.");
  }
  if (!config.monitorOutputDeviceId) {
    throw new Error("Choose headphones for sound monitoring.");
  }
  if (config.microphoneDeviceId === config.cableOutputDeviceId) {
    throw new Error("The physical microphone cannot be the virtual cable.");
  }
  if (
    config.monitorOutputDeviceId &&
    config.monitorOutputDeviceId === config.cableOutputDeviceId
  ) {
    throw new Error(
      "Choose headphones instead of monitoring through the cable.",
    );
  }
  if (!validGain(config.microphoneGain) || !validGain(config.soundboardGain)) {
    throw new Error("External audio levels must be between 0% and 100%.");
  }
}

function validGain(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function cancelled(): DOMException {
  return new DOMException("Sound playback was replaced.", "AbortError");
}
