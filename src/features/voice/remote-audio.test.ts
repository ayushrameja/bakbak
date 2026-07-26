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

    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "speech",
    });

    expect(element).toBeInstanceOf(HTMLAudioElement);
    expect(element).toHaveAttribute("data-bakbak-remote-audio");
    expect(element).toHaveProperty("autoplay", true);
    expect(element).toHaveProperty("hidden", true);
    expect(host).toContainElement(element);
    expect(attach).toHaveBeenCalledOnce();
    expect(
      renderer.attach(track, { ownerId: "mira", sourceKind: "speech" }),
    ).toBe(element);
    expect(attach).toHaveBeenCalledOnce();
  });

  it("mutes current and future tracks while deafened", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    });

    renderer.setMuted(true);
    const second = renderer.attach(createTrack().track, {
      ownerId: "theo",
      sourceKind: "speech",
    });

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
    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    })!;

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
    const firstElement = renderer.attach(first.track, {
      ownerId: "mira",
      sourceKind: "speech",
    });
    renderer.attach(second.track, {
      ownerId: "theo",
      sourceKind: "speech",
    });

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
    renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    });

    renderer.cleanup();
    const nextRoomElement = renderer.attach(createTrack().track, {
      ownerId: "theo",
      sourceKind: "speech",
    });

    expect(nextRoomElement).toHaveProperty("muted", false);
  });

  it("ignores non-audio tracks", () => {
    const { attach, track } = createTrack("video");
    const renderer = new RemoteAudioRenderer();

    expect(
      renderer.attach(track, { ownerId: "mira", sourceKind: "speech" }),
    ).toBeNull();
    expect(attach).not.toHaveBeenCalled();
  });

  it("applies real element gain to current speech, screen, and soundboard tracks", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const speech = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
    const screen = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "screen-share",
    })!;
    const soundboard = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    })!;

    renderer.setGlobalGain("soundboard", 0.7);
    renderer.setParticipantGain("mira", 0.5);

    expect(speech.volume).toBe(0.5);
    expect(screen.volume).toBe(0.5);
    expect(soundboard.volume).toBe(0.35);

    renderer.setParticipantGain("mira", 0);
    expect(speech.volume).toBe(0);
    expect(screen.volume).toBe(0);
    expect(soundboard.volume).toBe(0);
  });

  it("applies listener gain to tracks attached after the slider changes", () => {
    const renderer = new RemoteAudioRenderer();
    renderer.setParticipantGain("mira", 0.5);
    renderer.setGlobalGain("soundboard", 0.4);

    const speech = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
    const soundboard = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    })!;

    expect(speech.volume).toBe(0.5);
    expect(soundboard.volume).toBe(0.2);
  });

  it("routes current and future remote tracks to the selected speaker", async () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
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
      renderer.attach(createTrack().track, {
        ownerId: "theo",
        sourceKind: "speech",
      });
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
