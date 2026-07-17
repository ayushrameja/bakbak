import { describe, expect, it } from "vitest";
import { screenShareSubscriptionPolicy } from "./screen-share-subscription";

describe("screen share subscription policy", () => {
  it("keeps every gallery thumbnail on low video without source audio", () => {
    expect(screenShareSubscriptionPolicy("share-1", null)).toEqual({
      subscribeVideo: true,
      videoQuality: "low",
      subscribeAudio: false,
    });
  });

  it("promotes only the focused share to high video and source audio", () => {
    expect(screenShareSubscriptionPolicy("share-1", "share-1")).toEqual({
      subscribeVideo: true,
      videoQuality: "high",
      subscribeAudio: true,
    });
    expect(screenShareSubscriptionPolicy("share-2", "share-1")).toEqual({
      subscribeVideo: true,
      videoQuality: "low",
      subscribeAudio: false,
    });
  });
});
