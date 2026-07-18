export type VoiceEffect = "none" | "child" | "robot" | "radio";

export interface MicrophoneProcessingPreferences {
  enhancedNoiseSuppression: boolean;
  voiceEffect: VoiceEffect;
}

export const DEFAULT_MICROPHONE_PROCESSING_PREFERENCES: MicrophoneProcessingPreferences =
  {
    enhancedNoiseSuppression: true,
    voiceEffect: "none",
  };

export function readVoiceEffect(value: unknown): VoiceEffect {
  return value === "child" || value === "robot" || value === "radio"
    ? value
    : "none";
}
