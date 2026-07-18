export interface MediaDeviceGroups {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
}

export async function enumerateMediaDeviceGroups(
  mediaDevices: Pick<MediaDevices, "enumerateDevices"> = navigator.mediaDevices,
): Promise<MediaDeviceGroups> {
  const devices = await mediaDevices.enumerateDevices();
  return {
    inputs: uniqueDevices(devices, "audioinput"),
    outputs: uniqueDevices(devices, "audiooutput"),
    cameras: uniqueDevices(devices, "videoinput"),
  };
}

export function canSelectAudioOutput(): boolean {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    typeof (
      HTMLMediaElement.prototype as HTMLMediaElement & {
        setSinkId?: unknown;
      }
    ).setSinkId === "function"
  );
}

export async function setAudioElementOutput(
  element: HTMLMediaElement,
  deviceId: string,
): Promise<void> {
  if (deviceId === "default") {
    if (canSelectAudioOutput()) await element.setSinkId("default");
    return;
  }
  if (!canSelectAudioOutput()) {
    throw new Error("This runtime supports only the system output device.");
  }
  await element.setSinkId(deviceId);
}

function uniqueDevices(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
): MediaDeviceInfo[] {
  const seen = new Set<string>();
  return devices.filter((device) => {
    if (
      device.kind !== kind ||
      device.deviceId.length === 0 ||
      seen.has(device.deviceId)
    ) {
      return false;
    }
    seen.add(device.deviceId);
    return true;
  });
}
