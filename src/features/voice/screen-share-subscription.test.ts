import { describe, expect, it } from "vitest";
import { screenShareSubscriptionPolicy } from "./screen-share-subscription";

describe("screen share subscription policy", () => {
  it("keeps every unwatched share unsubscribed", () => {
    expect(screenShareSubscriptionPolicy("share-1", null)).toEqual({
      subscribeVideo: false,
      videoQuality: "low",
      subscribeAudio: false,
    });
  });

  it("subscribes only the watched share at high quality with source audio", () => {
    expect(screenShareSubscriptionPolicy("share-1", "share-1")).toEqual({
      subscribeVideo: true,
      videoQuality: "high",
      subscribeAudio: true,
    });
    expect(screenShareSubscriptionPolicy("share-2", "share-1")).toEqual({
      subscribeVideo: false,
      videoQuality: "low",
      subscribeAudio: false,
    });
  });

  it("keeps the presenter's companion video but never its companion audio", () => {
    expect(screenShareSubscriptionPolicy("mine", "mine", true)).toEqual({
      subscribeVideo: true,
      videoQuality: "high",
      subscribeAudio: false,
    });
    expect(screenShareSubscriptionPolicy("mine", null, true)).toEqual({
      subscribeVideo: true,
      videoQuality: "high",
      subscribeAudio: false,
    });
  });
});
