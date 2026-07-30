import {
  Track,
  version as liveKitClientVersion,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Room,
} from "livekit-client";
import type {
  RemoteAudioDiagnostic,
  RemoteAudioRenderer,
} from "./remote-audio";

const MAX_DIAGNOSTIC_EVENTS = 40;

export interface VoiceDiagnosticEvent {
  at: string;
  code: string;
  connectionState: string;
  participantSid: string | null;
  publicationSid: string | null;
  detail: string | null;
}

export interface VoiceInboundAudioStats {
  bytesReceived: number | null;
  packetsReceived: number | null;
  packetsLost: number | null;
  jitterSeconds: number | null;
  roundTripTimeSeconds: number | null;
}

export interface VoiceTrackDiagnostic {
  participantSid: string | null;
  publicationSid: string | null;
  source: string;
  subscriptionStatus: string;
  subscribed: boolean;
  muted: boolean;
  streamState: string;
  playback: RemoteAudioDiagnostic | null;
  inbound: VoiceInboundAudioStats | null;
}

export interface VoiceDiagnosticSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  trigger: string;
  liveKitClientVersion: string;
  connectionState: string;
  signalState: "connected" | "reconnecting";
  tracks: VoiceTrackDiagnostic[];
  recentEvents: VoiceDiagnosticEvent[];
}

interface RecordVoiceDiagnosticEvent {
  code: string;
  connectionState: string;
  participantSid?: string | null | undefined;
  publicationSid?: string | null | undefined;
  detail?: string | null | undefined;
}

export class VoiceDiagnosticsRecorder {
  private recentEvents: VoiceDiagnosticEvent[] = [];
  private signalState: "connected" | "reconnecting" = "connected";
  private lastSnapshot: VoiceDiagnosticSnapshot | null = null;
  private captureOperation = 0;

  record(event: RecordVoiceDiagnosticEvent): void {
    if (
      event.code === "signal-reconnecting" ||
      event.code === "transport-reconnecting"
    ) {
      this.signalState = "reconnecting";
    } else if (event.code === "signal-restored" || event.code === "connected") {
      this.signalState = "connected";
    }
    this.recentEvents = [
      ...this.recentEvents,
      {
        at: new Date().toISOString(),
        code: sanitizeCode(event.code),
        connectionState: sanitizeCode(event.connectionState),
        participantSid: sanitizeIdentifier(event.participantSid),
        publicationSid: sanitizeIdentifier(event.publicationSid),
        detail: event.detail ? sanitizeCode(event.detail) : null,
      },
    ].slice(-MAX_DIAGNOSTIC_EVENTS);
  }

  async capture(
    room: Room | null,
    remoteAudio: RemoteAudioRenderer,
    trigger: string,
  ): Promise<VoiceDiagnosticSnapshot> {
    const operation = ++this.captureOperation;
    const playbackByPublication = new Map(
      remoteAudio
        .diagnostics()
        .filter(
          (
            diagnostic,
          ): diagnostic is RemoteAudioDiagnostic & {
            publicationSid: string;
          } => diagnostic.publicationSid !== null,
        )
        .map((diagnostic) => [diagnostic.publicationSid, diagnostic]),
    );
    const tracks = room
      ? await readRoomTracks(room, playbackByPublication)
      : (this.lastSnapshot?.tracks ?? []);
    const snapshot: VoiceDiagnosticSnapshot = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      trigger: sanitizeCode(trigger),
      liveKitClientVersion,
      connectionState: sanitizeCode(
        room?.state ?? this.lastSnapshot?.connectionState ?? "disconnected",
      ),
      signalState: this.signalState,
      tracks,
      recentEvents: [...this.recentEvents],
    };
    if (operation === this.captureOperation) this.lastSnapshot = snapshot;
    return snapshot;
  }

  readLast(): VoiceDiagnosticSnapshot | null {
    return this.lastSnapshot;
  }
}

export async function copyVoiceDiagnostics(
  snapshot: VoiceDiagnosticSnapshot,
  clipboard:
    Pick<Clipboard, "writeText"> | null | undefined = typeof navigator ===
  "undefined"
    ? undefined
    : navigator.clipboard,
): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(JSON.stringify(snapshot, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function readRoomTracks(
  room: Room,
  playbackByPublication: ReadonlyMap<string, RemoteAudioDiagnostic>,
): Promise<VoiceTrackDiagnostic[]> {
  const pending: Array<Promise<VoiceTrackDiagnostic>> = [];
  room.remoteParticipants.forEach((participant) => {
    participant.getTrackPublications().forEach((publication) => {
      if (publication.kind !== Track.Kind.Audio) return;
      pending.push(
        readPublication(
          participant,
          publication as RemoteTrackPublication,
          playbackByPublication,
        ),
      );
    });
  });
  return Promise.all(pending);
}

async function readPublication(
  participant: RemoteParticipant,
  publication: RemoteTrackPublication,
  playbackByPublication: ReadonlyMap<string, RemoteAudioDiagnostic>,
): Promise<VoiceTrackDiagnostic> {
  const track =
    publication.track?.kind === Track.Kind.Audio
      ? (publication.track as RemoteAudioTrack)
      : null;
  return {
    participantSid: sanitizeIdentifier(participant.sid),
    publicationSid: sanitizeIdentifier(publication.trackSid),
    source: sanitizeCode(publication.source),
    subscriptionStatus: sanitizeCode(publication.subscriptionStatus),
    subscribed: publication.isSubscribed,
    muted: publication.isMuted,
    streamState: sanitizeCode(track?.streamState ?? Track.StreamState.Unknown),
    playback: playbackByPublication.get(publication.trackSid) ?? null,
    inbound: track ? await readInboundAudioStats(track) : null,
  };
}

async function readInboundAudioStats(
  track: RemoteAudioTrack,
): Promise<VoiceInboundAudioStats | null> {
  let report: RTCStatsReport | undefined;
  try {
    report = await track.getRTCStatsReport();
  } catch {
    return null;
  }
  if (!report) return null;

  let inbound: RTCStats | null = null;
  let remoteOutbound: RTCStats | null = null;
  const stats = report.values() as IterableIterator<RTCStats>;
  for (const candidate of stats) {
    if (!isAudioStats(candidate)) continue;
    if (candidate.type === "inbound-rtp") inbound = candidate;
    if (candidate.type === "remote-outbound-rtp") remoteOutbound = candidate;
  }
  if (!inbound && !remoteOutbound) return null;

  return {
    bytesReceived: numericStat(inbound, "bytesReceived"),
    packetsReceived: numericStat(inbound, "packetsReceived"),
    packetsLost: numericStat(inbound, "packetsLost"),
    jitterSeconds: numericStat(inbound, "jitter"),
    roundTripTimeSeconds: numericStat(remoteOutbound, "roundTripTime"),
  };
}

function isAudioStats(stat: RTCStats): boolean {
  const record = stat as RTCStats & {
    kind?: string;
    mediaType?: string;
  };
  return record.kind === "audio" || record.mediaType === "audio";
}

function numericStat(stat: RTCStats | null, key: string): number | null {
  if (!stat) return null;
  const value = (stat as RTCStats & Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return sanitized || null;
}

function sanitizeCode(value: unknown): string {
  const raw = typeof value === "string" ? value : String(value);
  return raw.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
}
