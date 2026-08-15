import type {
  AudioCaptureOptions,
  LocalAudioTrack,
  Room,
} from "livekit-client";

const INPUT_SWITCH_ERROR =
  "Bakbak couldn't switch microphones. The previous microphone is still active; reconnect the device or check microphone permissions.";
const INPUT_SWITCH_RESTORE_ERROR =
  "Bakbak couldn't switch microphones and couldn't restore the previous one. Rejoin voice after checking microphone permissions.";
const PLAYBACK_RESUME_ERROR =
  "Bakbak still couldn't start audio. Check the system output, then try Enable audio again.";
const OUTPUT_SWITCH_ERROR =
  "Bakbak couldn't switch speakers. The previous output is still active.";
const CAMERA_SWITCH_ERROR =
  "Bakbak couldn't switch cameras. The previous camera is still active.";

type AudioInputRoom = Pick<Room, "switchActiveDevice">;
type AudioPlaybackRoom = Pick<Room, "startAudio">;
type RestartableAudioTrack = Pick<
  LocalAudioTrack,
  "getDeviceId" | "restartTrack"
>;

interface DeafenAudioTargets {
  isCurrent: () => boolean;
  remoteAudio: { setMuted: (muted: boolean) => void };
  soundPlayback: { setDeafened: (deafened: boolean) => void };
}

export type AudioActionResult = { ok: true } | { ok: false; message: string };

export async function restartAudioInput(
  track: RestartableAudioTrack,
  nextOptions: AudioCaptureOptions,
  previousOptions: AudioCaptureOptions,
): Promise<AudioActionResult> {
  try {
    await track.restartTrack(nextOptions);
    if (!(await audioTrackUsesOptions(track, nextOptions))) {
      throw new Error("The requested microphone did not become active.");
    }
    return { ok: true };
  } catch {
    try {
      await track.restartTrack(previousOptions);
      if (!(await audioTrackUsesOptions(track, previousOptions))) {
        throw new Error("The previous microphone was not restored.");
      }
      return { ok: false, message: INPUT_SWITCH_ERROR };
    } catch {
      return { ok: false, message: INPUT_SWITCH_RESTORE_ERROR };
    }
  }
}

async function audioTrackUsesOptions(
  track: RestartableAudioTrack,
  options: AudioCaptureOptions,
): Promise<boolean> {
  const requested = requestedAudioDevice(options.deviceId);
  const active = await track.getDeviceId();
  return active === requested;
}

function requestedAudioDevice(
  deviceId: AudioCaptureOptions["deviceId"],
): string {
  if (typeof deviceId === "string") return deviceId;
  if (
    deviceId &&
    !Array.isArray(deviceId) &&
    typeof deviceId.exact === "string"
  ) {
    return deviceId.exact;
  }
  return "default";
}

export async function switchAudioOutput(
  room: AudioInputRoom,
  deviceId: string,
): Promise<AudioActionResult> {
  try {
    const switched = await room.switchActiveDevice("audiooutput", deviceId);
    return switched
      ? { ok: true }
      : { ok: false, message: OUTPUT_SWITCH_ERROR };
  } catch {
    return { ok: false, message: OUTPUT_SWITCH_ERROR };
  }
}

export async function switchCameraInput(
  room: AudioInputRoom,
  deviceId: string,
): Promise<AudioActionResult> {
  try {
    const switched = await room.switchActiveDevice("videoinput", deviceId);
    return switched
      ? { ok: true }
      : { ok: false, message: CAMERA_SWITCH_ERROR };
  } catch {
    return { ok: false, message: CAMERA_SWITCH_ERROR };
  }
}

export async function resumeAudioPlayback(
  room: AudioPlaybackRoom,
): Promise<AudioActionResult> {
  try {
    await room.startAudio();
    return { ok: true };
  } catch {
    return { ok: false, message: PLAYBACK_RESUME_ERROR };
  }
}

/**
 * Applies Deafen without letting LiveKit's playback recovery briefly unmute
 * remote tracks. Recovery only runs as part of the user's undeafen gesture.
 */
export async function setAudioDeafened(
  nextDeafened: boolean,
  playbackBlocked: boolean,
  room: AudioPlaybackRoom | null,
  targets: DeafenAudioTargets,
): Promise<AudioActionResult | null> {
  targets.soundPlayback.setDeafened(nextDeafened);

  if (nextDeafened) {
    targets.remoteAudio.setMuted(true);
    return null;
  }

  const resumeResult =
    playbackBlocked && room ? await resumeAudioPlayback(room) : null;
  if (targets.isCurrent()) targets.remoteAudio.setMuted(false);
  return resumeResult;
}
