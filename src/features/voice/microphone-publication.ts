import { Track, type TrackPublication } from "livekit-client";
import { SOUNDBOARD_TRACK_NAME } from "../soundboard/soundboard-audio";

export const SPEECH_MICROPHONE_TRACK_NAME = "bakbak-microphone";

type MicrophonePublication = Pick<TrackPublication, "source" | "trackName">;

export function findSpeechMicrophonePublication<
  Publication extends MicrophonePublication,
>(publications: readonly Publication[]): Publication | undefined {
  let legacySpeechPublication: Publication | undefined;

  for (const publication of publications) {
    if (publication.source !== Track.Source.Microphone) continue;
    if (publication.trackName === SPEECH_MICROPHONE_TRACK_NAME) {
      return publication;
    }
    if (
      publication.trackName !== SOUNDBOARD_TRACK_NAME &&
      legacySpeechPublication === undefined
    ) {
      legacySpeechPublication = publication;
    }
  }

  return legacySpeechPublication;
}
