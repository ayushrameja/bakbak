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
        }),
      ),
    };
    expect(loadDevicePreferences(storage)).toEqual({
      inputDeviceId: "mic-1",
      outputDeviceId: "speaker-1",
      cameraDeviceId: "camera-1",
      soundboardVolume: 0.45,
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

  it("stores device ids and local soundboard volume", () => {
    const setItem = vi.fn();
    saveDevicePreferences(
      {
        inputDeviceId: "mic-1",
        outputDeviceId: "speaker-1",
        cameraDeviceId: "camera-1",
        soundboardVolume: 0.6,
      },
      { setItem },
    );
    expect(JSON.parse(setItem.mock.calls[0]?.[1] as string)).toEqual({
      inputDeviceId: "mic-1",
      outputDeviceId: "speaker-1",
      cameraDeviceId: "camera-1",
      soundboardVolume: 0.6,
    });
  });
});
