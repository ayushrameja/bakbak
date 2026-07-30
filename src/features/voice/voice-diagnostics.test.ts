import {
  Track,
  TrackPublication,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Room,
} from "livekit-client";
import { describe, expect, it, vi } from "vitest";
import { RemoteAudioRenderer } from "./remote-audio";
import {
  VoiceDiagnosticsRecorder,
  copyVoiceDiagnostics,
} from "./voice-diagnostics";

function createDiagnosticFixture() {
  const report = new Map<string, RTCStats>([
    [
      "inbound",
      {
        id: "inbound",
        timestamp: 1,
        type: "inbound-rtp",
        kind: "audio",
        bytesReceived: 9_000,
        packetsReceived: 120,
        packetsLost: 3,
        jitter: 0.014,
        forbiddenCandidateAddress: "10.0.0.2",
      } as RTCStats,
    ],
    [
      "remote-outbound",
      {
        id: "remote-outbound",
        timestamp: 1,
        type: "remote-outbound-rtp",
        kind: "audio",
        roundTripTime: 0.083,
      } as RTCStats,
    ],
  ]) as unknown as RTCStatsReport;
  const track = {
    kind: Track.Kind.Audio,
    streamState: Track.StreamState.Active,
    attach: vi.fn((element: HTMLMediaElement) => element),
    detach: vi.fn((element: HTMLMediaElement) => element),
    getRTCStatsReport: vi.fn().mockResolvedValue(report),
  } as unknown as RemoteAudioTrack;
  const publication = {
    kind: Track.Kind.Audio,
    source: Track.Source.Microphone,
    trackSid: "TR_speech",
    trackName: "bakbak-microphone",
    track,
    isSubscribed: true,
    isMuted: false,
    subscriptionStatus: TrackPublication.SubscriptionStatus.Subscribed,
  } as unknown as RemoteTrackPublication;
  const participant = {
    sid: "PA_ephemeral",
    identity: "persistent-user-id-must-not-leak",
    name: "Mira must not leak",
    getTrackPublications: () => [publication],
  } as unknown as RemoteParticipant;
  const room = {
    state: "connected",
    remoteParticipants: new Map([["persistent-user-id", participant]]),
  } as unknown as Room;
  const remoteAudio = new RemoteAudioRenderer(() =>
    document.createElement("div"),
  );
  remoteAudio.attach(track, {
    ownerId: participant.identity,
    sourceKind: "speech",
    participantSid: participant.sid,
    publicationSid: publication.trackSid,
  });
  return { remoteAudio, room };
}

describe("VoiceDiagnosticsRecorder", () => {
  it("copies only whitelisted voice health and inbound metrics", async () => {
    const { remoteAudio, room } = createDiagnosticFixture();
    const recorder = new VoiceDiagnosticsRecorder();
    recorder.record({
      code: "subscription failed",
      connectionState: "signalReconnecting",
      participantSid: "PA_ephemeral",
      publicationSid: "TR_speech",
      detail: "reason-1",
    });

    const snapshot = await recorder.capture(room, remoteAudio, "manual copy");

    expect(snapshot.liveKitClientVersion).toBe("2.21.0");
    expect(snapshot.tracks).toEqual([
      expect.objectContaining({
        participantSid: "PA_ephemeral",
        publicationSid: "TR_speech",
        source: "microphone",
        subscribed: true,
        inbound: {
          bytesReceived: 9_000,
          packetsReceived: 120,
          packetsLost: 3,
          jitterSeconds: 0.014,
          roundTripTimeSeconds: 0.083,
        },
      }),
    ]);
    expect(snapshot.recentEvents[0]).toEqual(
      expect.objectContaining({
        code: "subscription_failed",
        detail: "reason-1",
      }),
    );
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("persistent-user-id");
    expect(serialized).not.toContain("Mira");
    expect(serialized).not.toContain("10.0.0.2");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("device");
  });

  it("preserves the last in-memory track snapshot after the room is gone", async () => {
    const { remoteAudio, room } = createDiagnosticFixture();
    const recorder = new VoiceDiagnosticsRecorder();
    await recorder.capture(room, remoteAudio, "failure");
    remoteAudio.cleanup();

    const snapshot = await recorder.capture(null, remoteAudio, "after-leave");

    expect(snapshot.connectionState).toBe("connected");
    expect(snapshot.tracks[0]?.publicationSid).toBe("TR_speech");
  });

  it("writes formatted diagnostics only through an explicit copy action", async () => {
    const { remoteAudio, room } = createDiagnosticFixture();
    const recorder = new VoiceDiagnosticsRecorder();
    const snapshot = await recorder.capture(room, remoteAudio, "manual-copy");
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await expect(copyVoiceDiagnostics(snapshot, clipboard)).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"schemaVersion": 1'),
    );
    await expect(copyVoiceDiagnostics(snapshot, null)).resolves.toBe(false);
  });
});
