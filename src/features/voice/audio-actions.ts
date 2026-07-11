import type { Room } from "livekit-client";

const INPUT_SWITCH_ERROR =
  "Bakbak couldn't switch microphones. The previous microphone is still active; reconnect the device or check macOS Privacy & Security.";
const PLAYBACK_RESUME_ERROR =
  "Bakbak still couldn't start audio. Check the system output, then try Enable audio again.";
const OUTPUT_SWITCH_ERROR =
  "Bakbak couldn't switch speakers. The previous output is still active.";
const CAMERA_SWITCH_ERROR =
  "Bakbak couldn't switch cameras. The previous camera is still active.";

type AudioInputRoom = Pick<Room, "switchActiveDevice">;
type AudioPlaybackRoom = Pick<Room, "startAudio">;

interface DeafenAudioTargets {
  isCurrent: () => boolean;
  remoteAudio: { setMuted: (muted: boolean) => void };
  soundPlayback: { setDeafened: (deafened: boolean) => void };
}

export type AudioActionResult = { ok: true } | { ok: false; message: string };

export async function switchAudioInput(
  room: AudioInputRoom,
  deviceId: string,
): Promise<AudioActionResult> {
  try {
    const switched = await room.switchActiveDevice("audioinput", deviceId);
    return switched ? { ok: true } : { ok: false, message: INPUT_SWITCH_ERROR };
  } catch {
    return { ok: false, message: INPUT_SWITCH_ERROR };
  }
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
