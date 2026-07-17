import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SCREEN_SHARE_SETTINGS,
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_PREFERENCES_KEY,
  SCREEN_SHARE_RESOLUTIONS,
  loadScreenShareSettings,
  saveScreenShareSettings,
  screenShareBitrate,
} from "./screen-share-preferences";

describe("screen-share preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts at the maximum profile and recovers from malformed values", () => {
    expect(loadScreenShareSettings()).toEqual(DEFAULT_SCREEN_SHARE_SETTINGS);
    window.localStorage.setItem(
      SCREEN_SHARE_PREFERENCES_KEY,
      JSON.stringify({ resolution: 2160, frameRate: "fast" }),
    );
    expect(loadScreenShareSettings()).toEqual(DEFAULT_SCREEN_SHARE_SETTINGS);
  });

  it("remembers the last successful profile", () => {
    saveScreenShareSettings({ resolution: 720, frameRate: 30 });
    expect(loadScreenShareSettings()).toEqual({
      resolution: 720,
      frameRate: 30,
    });
  });

  it("maps every supported profile to its approved bitrate ceiling", () => {
    const expected = [
      800_000, 1_500_000, 2_500_000, 1_500_000, 2_000_000, 4_000_000, 2_500_000,
      5_000_000, 8_000_000,
    ];
    const actual = SCREEN_SHARE_RESOLUTIONS.flatMap((resolution) =>
      SCREEN_SHARE_FRAME_RATES.map((frameRate) =>
        screenShareBitrate({ resolution, frameRate }),
      ),
    );
    expect(actual).toEqual(expected);
  });
});
