import {
  DEFAULT_MICROPHONE_PROCESSING_PREFERENCES,
  readVoiceEffect,
  type MicrophoneProcessingPreferences,
} from "./microphone-preferences";

export interface DevicePreferences {
  inputDeviceId: string;
  outputDeviceId: string;
  cameraDeviceId: string;
  soundboardVolume: number;
  enhancedNoiseSuppression: boolean;
  voiceEffect: MicrophoneProcessingPreferences["voiceEffect"];
}

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  inputDeviceId: "default",
  outputDeviceId: "default",
  cameraDeviceId: "default",
  soundboardVolume: 0.7,
  ...DEFAULT_MICROPHONE_PROCESSING_PREFERENCES,
};

const DEVICE_PREFERENCES_KEY = "bakbak.devicePreferences.v2";
const LEGACY_DEVICE_PREFERENCES_KEY = "bakbak.devicePreferences.v1";

export function loadDevicePreferences(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): DevicePreferences {
  try {
    const raw =
      storage.getItem(DEVICE_PREFERENCES_KEY) ??
      storage.getItem(LEGACY_DEVICE_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_DEVICE_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_DEVICE_PREFERENCES };
    return {
      inputDeviceId: readDeviceId(parsed.inputDeviceId),
      outputDeviceId: readDeviceId(parsed.outputDeviceId),
      cameraDeviceId: readDeviceId(parsed.cameraDeviceId),
      soundboardVolume: readVolume(parsed.soundboardVolume),
      enhancedNoiseSuppression:
        typeof parsed.enhancedNoiseSuppression === "boolean"
          ? parsed.enhancedNoiseSuppression
          : DEFAULT_DEVICE_PREFERENCES.enhancedNoiseSuppression,
      voiceEffect: readVoiceEffect(parsed.voiceEffect),
    };
  } catch {
    return { ...DEFAULT_DEVICE_PREFERENCES };
  }
}

export function saveDevicePreferences(
  preferences: DevicePreferences,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  try {
    storage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Device preferences are a convenience; media controls must still work.
  }
}

export function availableDeviceId(
  preferredId: string,
  devices: ReadonlyArray<Pick<MediaDeviceInfo, "deviceId">>,
): string {
  if (
    preferredId === "default" ||
    devices.some((device) => device.deviceId === preferredId)
  ) {
    return preferredId;
  }
  const runtimeHasRevealedSpecificDevices = devices.some(
    (device) =>
      device.deviceId !== "default" && device.deviceId !== "communications",
  );
  return runtimeHasRevealedSpecificDevices ? "default" : preferredId;
}

function readDeviceId(value: unknown): string {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    ? value
    : "default";
}

function readVolume(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : DEFAULT_DEVICE_PREFERENCES.soundboardVolume;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
