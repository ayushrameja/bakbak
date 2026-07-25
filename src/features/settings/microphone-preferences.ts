export interface MicrophoneProcessingPreferences {
  enhancedNoiseSuppression: boolean;
}

export const DEFAULT_MICROPHONE_PROCESSING_PREFERENCES: MicrophoneProcessingPreferences =
  {
    enhancedNoiseSuppression: true,
  };
