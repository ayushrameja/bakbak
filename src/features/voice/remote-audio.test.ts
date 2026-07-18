import { describe, expect, it, vi } from "vitest";
import { RemoteAudioRenderer, type RemoteAudioTrackLike } from "./remote-audio";

function createTrack(kind = "audio") {
  const attach = vi.fn((element: HTMLMediaElement) => element);
  const detach = vi.fn((element: HTMLMediaElement) => element);
  const track: RemoteAudioTrackLike = { kind, attach, detach };
  return { attach, detach, track };
}

describe("RemoteAudioRenderer", () => {
  it("attaches each subscribed audio track to one hidden element", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const { attach, track } = createTrack();

    const element = renderer.attach(track);

    expect(element).toBeInstanceOf(HTMLAudioElement);
    expect(element).toHaveAttribute("data-bakbak-remote-audio");
    expect(element).toHaveProperty("autoplay", true);
    expect(element).toHaveProperty("hidden", true);
    expect(host).toContainElement(element);
    expect(attach).toHaveBeenCalledOnce();
    expect(renderer.attach(track)).toBe(element);
    expect(attach).toHaveBeenCalledOnce();
  });

  it("mutes current and future tracks while deafened", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = renderer.attach(createTrack().track);

    renderer.setMuted(true);
    const second = renderer.attach(createTrack().track);

    expect(first).toHaveProperty("muted", true);
    expect(second).toHaveProperty("muted", true);

    renderer.setMuted(false);
    expect(first).toHaveProperty("muted", false);
    expect(second).toHaveProperty("muted", false);
  });

  it("keeps an idle soundboard track muted independently of deafen", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const { track } = createTrack();
    const element = renderer.attach(track)!;

    renderer.setTrackMuted(track, true);
    expect(element).toHaveProperty("muted", true);

    renderer.setMuted(true);
    renderer.setTrackMuted(track, false);
    expect(element).toHaveProperty("muted", true);

    renderer.setMuted(false);
    expect(element).toHaveProperty("muted", false);
  });

  it("detaches on unsubscribe and cleans every element on room teardown", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = createTrack();
    const second = createTrack();
    const firstElement = renderer.attach(first.track);
    renderer.attach(second.track);

    renderer.detach(first.track);

    expect(first.detach).toHaveBeenCalledWith(firstElement);
    expect(host).not.toContainElement(firstElement);
    expect(host.childElementCount).toBe(1);

    renderer.cleanup();
    expect(second.detach).toHaveBeenCalledOnce();
    expect(host).toBeEmptyDOMElement();
  });

  it("starts the next room audible after cleaning up a deafened room", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    renderer.setMuted(true);
    renderer.attach(createTrack().track);

    renderer.cleanup();
    const nextRoomElement = renderer.attach(createTrack().track);

    expect(nextRoomElement).toHaveProperty("muted", false);
  });

  it("ignores non-audio tracks", () => {
    const { attach, track } = createTrack("video");
    const renderer = new RemoteAudioRenderer();

    expect(renderer.attach(track)).toBeNull();
    expect(attach).not.toHaveBeenCalled();
  });

  it("applies listener-owned volume to a soundboard track", () => {
    const host = document.createElement("div");
    const setVolume = vi.fn();
    const { track } = createTrack();
    const volumeTrack = { ...track, setVolume };
    const renderer = new RemoteAudioRenderer(() => host);

    renderer.attach(volumeTrack, 0.35);
    renderer.setVolume(volumeTrack, 0.2);

    expect(setVolume).toHaveBeenNthCalledWith(1, 0.35);
    expect(setVolume).toHaveBeenNthCalledWith(2, 0.2);
  });

  it("routes current and future remote tracks to the selected speaker", async () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = renderer.attach(createTrack().track)!;
    const firstSetSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(first, "setSinkId", {
      configurable: true,
      value: firstSetSinkId,
    });

    await renderer.setDevice("speaker-2");
    expect(firstSetSinkId).toHaveBeenCalledWith("speaker-2");

    const original = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });
    try {
      renderer.attach(createTrack().track);
      expect(setSinkId).toHaveBeenCalledWith("speaker-2");
    } finally {
      if (original) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          original,
        );
      } else {
        Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
      }
    }
  });
});
