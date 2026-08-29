import { describe, expect, it } from "vitest";
import { parseExternalAudioOverlayMessage } from "./external-audio-overlay-channel";

describe("parseExternalAudioOverlayMessage", () => {
  it("accepts bounded play messages and rejects malformed commands", () => {
    expect(
      parseExternalAudioOverlayMessage({ type: "play", soundId: "sound-1" }),
    ).toEqual({
      type: "play",
      soundId: "sound-1",
    });
    expect(
      parseExternalAudioOverlayMessage({ type: "play", soundId: "" }),
    ).toBeNull();
    expect(parseExternalAudioOverlayMessage({ type: "stop-sound" })).toEqual({
      type: "stop-sound",
    });
    expect(
      parseExternalAudioOverlayMessage({ type: "stop-session" }),
    ).toBeNull();
  });

  it("sanitizes catalog fields before displaying them in another window", () => {
    expect(
      parseExternalAudioOverlayMessage({
        type: "catalog",
        sounds: [
          {
            id: "one",
            label: "Airhorn",
            emoji: "📣",
            favorite: true,
            assetStatus: "ready",
          },
          { id: 2, label: "bad" },
        ],
        recentSoundIds: ["one", 2],
      }),
    ).toEqual({
      type: "catalog",
      sounds: [
        {
          id: "one",
          label: "Airhorn",
          emoji: "📣",
          favorite: true,
          assetStatus: "ready",
        },
      ],
      recentSoundIds: ["one"],
    });
  });
});
