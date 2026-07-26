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
          macosKeepOtherAudioFullVolume: true,
        }),
      ),
    };
    expect(loadDevicePreferences(storage)).toEqual({
      inputDeviceId: "mic-1",
      outputDeviceId: "speaker-1",
      cameraDeviceId: "camera-1",
      soundboardVolume: 0.45,
      enhancedNoiseSuppression: false,
      macosKeepOtherAudioFullVolume: true,
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
        macosKeepOtherAudioFullVolume: false,
      },
      { setItem },
    );
    expect(JSON.parse(setItem.mock.calls[0]?.[1] as string)).toEqual({
      inputDeviceId: "mic-1",
      outputDeviceId: "speaker-1",
      cameraDeviceId: "camera-1",
      soundboardVolume: 0.6,
      enhancedNoiseSuppression: true,
      macosKeepOtherAudioFullVolume: false,
    });
    expect(setItem).toHaveBeenCalledWith(
      "bakbak.devicePreferences.v4",
      expect.any(String),
    );
  });

  it("migrates every v3 false value to the new default once", () => {
    const storage = {
      getItem: vi.fn((key: string) =>
        key === "bakbak.devicePreferences.v3"
          ? JSON.stringify({
              inputDeviceId: "legacy-mic",
              outputDeviceId: "default",
              cameraDeviceId: "default",
              soundboardVolume: 0.5,
              enhancedNoiseSuppression: true,
              macosKeepOtherAudioFullVolume: false,
            })
          : null,
      ),
    };

    expect(loadDevicePreferences(storage)).toMatchObject({
      inputDeviceId: "legacy-mic",
      macosKeepOtherAudioFullVolume: true,
    });
  });

  it("preserves an intentional v4 false value", () => {
    const storage = {
      getItem: vi.fn((key: string) =>
        key === "bakbak.devicePreferences.v4"
          ? JSON.stringify({
              inputDeviceId: "mic",
              outputDeviceId: "default",
              cameraDeviceId: "default",
              soundboardVolume: 0.5,
              enhancedNoiseSuppression: true,
              macosKeepOtherAudioFullVolume: false,
            })
          : null,
      ),
    };

    expect(loadDevicePreferences(storage)).toMatchObject({
      macosKeepOtherAudioFullVolume: false,
    });
  });

  it("migrates v2 values while discarding the removed voice effect", () => {
    const storage = {
      getItem: vi.fn((key: string) =>
        key === "bakbak.devicePreferences.v2"
          ? JSON.stringify({
              inputDeviceId: "legacy-mic",
              outputDeviceId: "default",
              cameraDeviceId: "default",
              soundboardVolume: 0.5,
              enhancedNoiseSuppression: false,
              voiceEffect: "robot",
            })
          : null,
      ),
    };

    expect(loadDevicePreferences(storage)).toEqual({
      inputDeviceId: "legacy-mic",
      outputDeviceId: "default",
      cameraDeviceId: "default",
      soundboardVolume: 0.5,
      enhancedNoiseSuppression: false,
      macosKeepOtherAudioFullVolume: true,
    });
  });

  it("migrates v1 values with safe microphone-processing defaults", () => {
    const storage = {
      getItem: vi.fn((key: string) =>
        key === "bakbak.devicePreferences.v1"
          ? JSON.stringify({
              inputDeviceId: "legacy-mic",
              outputDeviceId: "default",
              cameraDeviceId: "default",
              soundboardVolume: 0.5,
            })
          : null,
      ),
    };

    expect(loadDevicePreferences(storage)).toEqual({
      inputDeviceId: "legacy-mic",
      outputDeviceId: "default",
      cameraDeviceId: "default",
      soundboardVolume: 0.5,
      enhancedNoiseSuppression: true,
      macosKeepOtherAudioFullVolume: true,
    });
  });
});
