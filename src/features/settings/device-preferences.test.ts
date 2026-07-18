import { describe, expect, it, vi } from "vitest";
import {
  availableDeviceId,
  DEFAULT_DEVICE_PREFERENCES,
  loadDevicePreferences,
  saveDevicePreferences,
} from "./device-preferences";

describe("device preferences", () => {
  it("loads validated local device ids", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          inputDeviceId: "mic-1",
          outputDeviceId: "speaker-1",
          cameraDeviceId: "camera-1",
          soundboardVolume: 0.45,
          enhancedNoiseSuppression: false,
          voiceEffect: "robot",
        }),
      ),
    };
    expect(loadDevicePreferences(storage)).toEqual({
      inputDeviceId: "mic-1",
      outputDeviceId: "speaker-1",
      cameraDeviceId: "camera-1",
      soundboardVolume: 0.45,
      enhancedNoiseSuppression: false,
      voiceEffect: "robot",
    });
  });

  it("falls back safely for malformed or missing devices", () => {
    expect(loadDevicePreferences({ getItem: () => "not json" })).toEqual(
      DEFAULT_DEVICE_PREFERENCES,
    );
    expect(availableDeviceId("gone", [{ deviceId: "present" }])).toBe(
      "default",
    );
  });

  it("keeps a saved device while permission-limited discovery shows only defaults", () => {
    expect(availableDeviceId("speaker-1", [{ deviceId: "default" }])).toBe(
      "speaker-1",
    );
    expect(availableDeviceId("speaker-1", [])).toBe("speaker-1");
  });

  it("stores device ids and local soundboard volume", () => {
    const setItem = vi.fn();
    saveDevicePreferences(
      {
        inputDeviceId: "mic-1",
        outputDeviceId: "speaker-1",
        cameraDeviceId: "camera-1",
        soundboardVolume: 0.6,
        enhancedNoiseSuppression: true,
        voiceEffect: "child",
      },
      { setItem },
    );
    expect(JSON.parse(setItem.mock.calls[0]?.[1] as string)).toEqual({
      inputDeviceId: "mic-1",
      outputDeviceId: "speaker-1",
      cameraDeviceId: "camera-1",
      soundboardVolume: 0.6,
      enhancedNoiseSuppression: true,
      voiceEffect: "child",
    });
  });

  it("migrates v1 values with safe microphone-processing defaults", () => {
    const storage = {
      getItem: vi
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(
          JSON.stringify({
            inputDeviceId: "legacy-mic",
            outputDeviceId: "default",
            cameraDeviceId: "default",
            soundboardVolume: 0.5,
          }),
        ),
    };

    expect(loadDevicePreferences(storage)).toEqual({
      inputDeviceId: "legacy-mic",
      outputDeviceId: "default",
      cameraDeviceId: "default",
      soundboardVolume: 0.5,
      enhancedNoiseSuppression: true,
      voiceEffect: "none",
    });
  });
});
