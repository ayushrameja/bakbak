import { describe, expect, it, vi } from "vitest";
import {
  enumerateMediaDeviceGroups,
  setAudioElementOutput,
} from "./media-devices";

function device(
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({}),
  };
}

describe("media devices", () => {
  it("keeps every unique input, output, and camera returned by the runtime", async () => {
    const devices = [
      device("audiooutput", "default", "System default"),
      device("audiooutput", "speaker-1", "Studio Display"),
      device("audiooutput", "speaker-2", "Headphones"),
      device("audiooutput", "speaker-2", "Headphones duplicate"),
      device("audiooutput", "", "Permission placeholder"),
      device("audioinput", "mic-1", "Desk microphone"),
      device("videoinput", "camera-1", "Camera"),
    ];

    await expect(
      enumerateMediaDeviceGroups({
        enumerateDevices: vi.fn().mockResolvedValue(devices),
      }),
    ).resolves.toEqual({
      inputs: [devices[5]],
      outputs: [devices[0], devices[1], devices[2]],
      cameras: [devices[6]],
    });
  });

  it("routes an audio element to the chosen speaker when supported", async () => {
    const original = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });
    try {
      await setAudioElementOutput(document.createElement("audio"), "speaker-2");
      expect(setSinkId).toHaveBeenCalledWith("speaker-2");
    } finally {
      if (original) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          original,
        );
      } else {
        Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
      }
    }
  });
});
