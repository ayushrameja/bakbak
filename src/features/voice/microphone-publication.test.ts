import { Track } from "livekit-client";
import { describe, expect, it } from "vitest";
import { SOUNDBOARD_TRACK_NAME } from "../soundboard/soundboard-audio";
import {
  SPEECH_MICROPHONE_TRACK_NAME,
  findSpeechMicrophonePublication,
} from "./microphone-publication";

describe("findSpeechMicrophonePublication", () => {
  it("prefers the named speech track when soundboard was published first", () => {
    const soundboard = publication(SOUNDBOARD_TRACK_NAME);
    const speech = publication(SPEECH_MICROPHONE_TRACK_NAME);

    expect(findSpeechMicrophonePublication([soundboard, speech])).toBe(speech);
  });

  it("falls back to an unnamed microphone track from older clients", () => {
    const soundboard = publication(SOUNDBOARD_TRACK_NAME);
    const legacySpeech = publication("browser-generated-track-id");

    expect(findSpeechMicrophonePublication([soundboard, legacySpeech])).toBe(
      legacySpeech,
    );
  });

  it("does not mistake the soundboard for speech", () => {
    expect(
      findSpeechMicrophonePublication([
        publication("camera", Track.Source.Camera),
        publication(SOUNDBOARD_TRACK_NAME),
      ]),
    ).toBeUndefined();
  });
});

function publication(
  trackName: string,
  source: Track.Source = Track.Source.Microphone,
) {
  return { source, trackName };
}
