export type ExternalAudioCableKind = "blackhole-2ch" | "vb-cable" | "unknown";

export interface ExternalAudioDevice {
  id: string;
  label: string;
  kind: "input" | "output";
  isDefault: boolean;
  cableKind: ExternalAudioCableKind | null;
}

export interface ExternalAudioDeviceSnapshot {
  inputs: ExternalAudioDevice[];
  outputs: ExternalAudioDevice[];
  recommendedCableInputId: string | null;
  recommendedCableOutputId: string | null;
}

export interface ExternalAudioSessionConfig {
  microphoneDeviceId: string;
  cableOutputDeviceId: string;
  monitorOutputDeviceId: string | null;
  microphoneGain: number;
  soundboardGain: number;
}

export type ExternalAudioSessionStatus =
  "idle" | "starting" | "testing" | "live" | "stopping" | "suspended" | "error";

export interface ExternalAudioSessionState {
  status: ExternalAudioSessionStatus;
  config: ExternalAudioSessionConfig | null;
  microphoneMuted: boolean;
  activeSoundId: string | null;
  errorCode: string | null;
  message: string | null;
}

export interface ExternalAudioLevels {
  microphone: number;
  output: number;
  clipping: boolean;
}

export interface ExternalAudioFailure {
  code: string;
  message: string;
}

export interface ExternalAudioSetupTestConfig {
  microphoneDeviceId: string;
  monitorOutputDeviceId: string | null;
}

export interface ExternalAudioSetupRecording {
  sampleRate: 48_000;
  samples: number[];
}

export type ExternalAudioSetupRecordingStatus = "idle" | "recording" | "ready";

export interface ExternalAudioPcmInput {
  soundId: string;
  sampleRate: 48_000;
  samples: number[];
}

export interface ExternalAudioDesktopApi {
  listDevices(): Promise<ExternalAudioDeviceSnapshot>;
  getState(): Promise<ExternalAudioSessionState>;
  startSetupTest(
    config: ExternalAudioSetupTestConfig,
  ): Promise<ExternalAudioSessionState>;
  clearSetupRecording(): Promise<void>;
  captureSetupRecording(): Promise<ExternalAudioSetupRecording>;
  playSetupTone(): Promise<ExternalAudioSessionState>;
  playSetupRecording(
    recording: ExternalAudioSetupRecording,
  ): Promise<ExternalAudioSessionState>;
  stopSetupTest(): Promise<ExternalAudioSessionState>;
  start(config: ExternalAudioSessionConfig): Promise<ExternalAudioSessionState>;
  update(input: {
    microphoneMuted?: boolean;
    microphoneGain?: number;
    soundboardGain?: number;
  }): Promise<ExternalAudioSessionState>;
  stop(): Promise<ExternalAudioSessionState>;
  play(input: ExternalAudioPcmInput): Promise<ExternalAudioSessionState>;
  stopSound(): Promise<ExternalAudioSessionState>;
  showOverlay(): Promise<void>;
  hideOverlay(): Promise<void>;
  onState(listener: (state: ExternalAudioSessionState) => void): () => void;
  onLevels(listener: (levels: ExternalAudioLevels) => void): () => void;
  onFailure(listener: (failure: ExternalAudioFailure) => void): () => void;
  onCloseExplanation(listener: () => void): () => void;
}
