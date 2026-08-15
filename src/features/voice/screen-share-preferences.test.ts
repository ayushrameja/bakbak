import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SCREEN_SHARE_SETTINGS,
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_PREFERENCES_KEY,
  SCREEN_SHARE_RESOLUTIONS,
  loadScreenShareSettings,
  saveScreenShareSettings,
  screenShareBitrate,
  screenSharePublicationProfile,
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

  it("keeps static shares detail-first and makes game-rate fallback layers smooth", () => {
    expect(
      screenSharePublicationProfile({ resolution: 1080, frameRate: 15 }),
    ).toEqual({
      width: 1920,
      height: 1080,
      contentHint: "detail",
      degradationPreference: "maintain-resolution",
      simulcastLayer: null,
    });
    expect(
      screenSharePublicationProfile({ resolution: 1080, frameRate: 60 }),
    ).toEqual({
      width: 1920,
      height: 1080,
      contentHint: "motion",
      degradationPreference: "maintain-framerate",
      simulcastLayer: {
        width: 960,
        height: 540,
        maxBitrate: 2_000_000,
        maxFramerate: 30,
      },
    });
    expect(
      screenSharePublicationProfile({ resolution: 480, frameRate: 30 })
        .simulcastLayer,
    ).toEqual({
      width: 426,
      height: 240,
      maxBitrate: 600_000,
      maxFramerate: 30,
    });
  });
});
