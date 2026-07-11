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
});
