import {
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  TrackEvent,
  createLocalScreenTracks,
  type LocalAudioTrack,
} from "livekit-client";
import { getDesktopBridge, isDesktopRuntime } from "../../lib/desktop-runtime";
import {
  DEFAULT_SCREEN_SHARE_SETTINGS,
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_RESOLUTIONS,
  parseScreenShareSettings,
  screenShareBitrate,
  type ScreenShareFrameRate,
  type ScreenShareResolution,
  type ScreenShareSettings,
} from "./screen-share-preferences";

type UnlistenFn = () => void;

export type ScreenShareLifecycleState =
  | "idle"
  | "selecting"
  | "starting"
  | "sharing"
  | "paused"
  | "stopping"
  | "error";

export type ScreenShareSourceKind = "display" | "window" | "application";
export type ScreenShareFailureCode =
  | "capture-black"
  | "cursor-unavailable"
  | "audio-isolation-unavailable"
  | "capture-failed";

export interface ScreenShareFailure {
  code: ScreenShareFailureCode;
  message: string;
  recommendedRetrySource: "display" | null;
}

export interface ScreenShareDiagnostics {
  os: string;
  osBuild: string;
  sourceKind: ScreenShareSourceKind;
  captureBackend: string;
  cursorCapability: string;
  audioIsolationMode: string;
  failureCode: ScreenShareFailureCode | null;
}

export interface ScreenShareCapabilities {
  available: boolean;
  nativeCapture: boolean;
  systemAudio: boolean;
  sourceKinds: ScreenShareSourceKind[];
  resolutions: ScreenShareResolution[];
  frameRates: ScreenShareFrameRate[];
  dynamicSettings: boolean;
  customPicker: boolean;
  reason: string | null;
}

export interface ScreenShareSource {
  id: string;
  kind: Extract<ScreenShareSourceKind, "display" | "application">;
  label: string;
  applicationLabel: string | null;
  audioAvailable: boolean;
  audioUnavailableReason: string | null;
  thumbnailDataUrl: string | null;
}

export interface StartScreenShareInput {
  serverUrl: string;
  token: string;
  includeAudio: boolean;
  settings: ScreenShareSettings;
  sourceId?: string | null;
}

export interface ScreenShareSession {
  sessionId: string;
  sourceLabel: string;
  sourceKind: ScreenShareSourceKind;
  audioPublished: boolean;
  audioUnavailableReason: string | null;
  settings: ScreenShareSettings;
  diagnostics?: ScreenShareDiagnostics;
}

export interface ScreenShareLifecycleEvent {
  state: ScreenShareLifecycleState;
  sessionId: string | null;
  sourceLabel: string | null;
  sourceKind: ScreenShareSourceKind | null;
  audioPublished: boolean;
  audioUnavailableReason: string | null;
  settings: ScreenShareSettings | null;
  message: string | null;
  failure?: ScreenShareFailure | null;
  diagnostics?: ScreenShareDiagnostics | null;
}

export class ScreenShareCaptureError extends Error {
  constructor(readonly failure: ScreenShareFailure) {
    super(failure.message);
    this.name = "ScreenShareCaptureError";
  }
}

interface ActiveScreenShare {
  session: ScreenShareSession;
  room: Room;
  videoTrack: LocalVideoTrack;
  audioTrack: LocalAudioTrack | null;
  stopping: boolean;
}

const lifecycleListeners = new Set<
  (event: ScreenShareLifecycleEvent) => void
>();
let activeScreenShare: ActiveScreenShare | null = null;

export function isDesktopApp(): boolean {
  return isDesktopRuntime();
}

export function getScreenShareCapabilities(): Promise<ScreenShareCapabilities> {
  if (!isDesktopRuntime()) {
    return Promise.resolve({
      available: false,
      nativeCapture: false,
      systemAudio: false,
      sourceKinds: [],
      resolutions: [...SCREEN_SHARE_RESOLUTIONS],
      frameRates: [...SCREEN_SHARE_FRAME_RATES],
      dynamicSettings: false,
      customPicker: false,
      reason: "Screen sharing is available in the installed desktop app.",
    });
  }

  return Promise.resolve({
    available: true,
    nativeCapture: true,
    systemAudio: true,
    sourceKinds: ["display", "application"],
    resolutions: [...SCREEN_SHARE_RESOLUTIONS],
    frameRates: [...SCREEN_SHARE_FRAME_RATES],
    dynamicSettings: true,
    customPicker: true,
    reason: null,
  });
}

export async function listScreenShareSources(): Promise<ScreenShareSource[]> {
  return (await getDesktopBridge()?.screenShare.listSources()) ?? [];
}

export async function openScreenRecordingSettings(): Promise<void> {
  await getDesktopBridge()?.app.openScreenRecordingSettings();
}

export async function restartDesktopApp(): Promise<void> {
  await getDesktopBridge()?.app.relaunch();
}

export async function startScreenShare(
  input: StartScreenShareInput,
): Promise<ScreenShareSession> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    throw new Error(
      "Screen sharing is available in the installed desktop app.",
    );
  }
  if (activeScreenShare) {
    throw new Error("A screen share is already active.");
  }

  const settings = parseScreenShareSettings(input.settings);
  const sessionId = crypto.randomUUID();
  let room: Room | null = null;
  try {
    const sources = await listScreenShareSources();
    const source = input.sourceId
      ? sources.find((candidate) => candidate.id === input.sourceId)
      : (sources.find((candidate) => candidate.kind === "display") ??
        sources[0]);
    if (!source) throw new Error("The selected screen source is unavailable.");

    await bridge.screenShare.prepare({
      sourceId: source.id,
      includeAudio: input.includeAudio,
    });
    room = new Room({
      adaptiveStream: false,
      dynacast: true,
      disconnectOnPageLeave: true,
    });
    await room.connect(input.serverUrl, input.token, { autoSubscribe: false });

    const tracks = await createLocalScreenTracks({
      audio: input.includeAudio
        ? {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            restrictOwnAudio: true,
          }
        : false,
      video: true,
      resolution: {
        width: Math.round(settings.resolution * (16 / 9)),
        height: settings.resolution,
        frameRate: settings.frameRate,
      },
      contentHint: "detail",
      selfBrowserSurface: "exclude",
      systemAudio: input.includeAudio ? "include" : "exclude",
    });
    const videoTrack = tracks.find(
      (track) => track.kind === Track.Kind.Video,
    ) as LocalVideoTrack | undefined;
    let audioTrack = (tracks.find((track) => track.kind === Track.Kind.Audio) ??
      null) as LocalAudioTrack | null;
    if (!videoTrack) throw new Error("The selected source returned no video.");

    videoTrack.mediaStreamTrack.contentHint = "detail";
    await room.localParticipant.publishTrack(videoTrack, {
      name: "bakbak-screen",
      source: Track.Source.ScreenShare,
      videoCodec: "h264",
      screenShareEncoding: {
        maxBitrate: screenShareBitrate(settings),
        maxFramerate: settings.frameRate,
      },
      simulcast: true,
      degradationPreference: "maintain-resolution",
    });

    let audioPublished = false;
    let audioUnavailableReason: string | null = null;
    if (input.includeAudio && audioTrack) {
      try {
        await room.localParticipant.publishTrack(audioTrack.mediaStreamTrack, {
          name: "bakbak-screen-audio",
          source: Track.Source.ScreenShareAudio,
          audioPreset: { maxBitrate: 128_000 },
          dtx: false,
          red: true,
          forceStereo: true,
        });
        audioPublished = true;
      } catch {
        audioTrack.stop();
        audioTrack = null;
        audioUnavailableReason =
          "The screen is live, but Electron could not publish system audio.";
      }
    } else if (input.includeAudio) {
      audioUnavailableReason =
        "The selected source did not provide a system-audio track.";
    }

    const diagnostics: ScreenShareDiagnostics = {
      os: bridge.platform,
      osBuild: navigator.userAgent,
      sourceKind: source.kind,
      captureBackend: "electron-desktop-capturer",
      cursorCapability: "chromium-capture",
      audioIsolationMode: input.includeAudio
        ? "chromium-restrict-own-audio"
        : "disabled",
      failureCode: null,
    };
    const session: ScreenShareSession = {
      sessionId,
      sourceLabel: source.label,
      sourceKind: source.kind,
      audioPublished,
      audioUnavailableReason,
      settings,
      diagnostics,
    };
    activeScreenShare = {
      session,
      room,
      videoTrack,
      audioTrack,
      stopping: false,
    };
    videoTrack.once(TrackEvent.Ended, () => {
      void endUnexpectedScreenShare(
        sessionId,
        "The selected screen or window stopped sharing.",
      );
    });
    room.once(RoomEvent.Disconnected, () => {
      if (activeScreenShare?.session.sessionId === sessionId) {
        void endUnexpectedScreenShare(
          sessionId,
          "The screen-share connection ended.",
        );
      }
    });
    logDiagnostics(diagnostics);
    emitLifecycle({
      state: "sharing",
      ...session,
      message: null,
      failure: null,
    });
    return session;
  } catch (caught) {
    await room?.disconnect(true).catch(() => undefined);
    const failure = parseScreenShareFailure(caught);
    console.error(`[Bakbak screen share] ${failure.code}: ${failure.message}`);
    throw new ScreenShareCaptureError(failure);
  }
}

export async function updateScreenShareSettings(
  sessionId: string,
  settings: ScreenShareSettings,
): Promise<ScreenShareSettings> {
  if (!isDesktopRuntime()) {
    throw new Error(
      "Live screen-share changes are available in the installed desktop app.",
    );
  }
  const active = activeScreenShare;
  if (!active || active.session.sessionId !== sessionId) {
    throw new Error("That screen-share session is no longer active.");
  }
  const updated = parseScreenShareSettings(settings);
  await active.videoTrack.mediaStreamTrack.applyConstraints({
    width: { ideal: Math.round(updated.resolution * (16 / 9)) },
    height: { ideal: updated.resolution },
    frameRate: { ideal: updated.frameRate },
  });
  const sender = active.videoTrack.sender;
  if (sender) {
    const parameters = sender.getParameters();
    const maxBitrate = screenShareBitrate(updated);
    const encodings = parameters.encodings;
    encodings.forEach((encoding, index) => {
      const scale = (index + 1) / encodings.length;
      encoding.maxBitrate = Math.round(maxBitrate * scale);
      encoding.maxFramerate = updated.frameRate;
    });
    await sender.setParameters(parameters);
  }
  active.session = { ...active.session, settings: updated };
  emitLifecycle({
    state: "sharing",
    ...active.session,
    message: null,
    failure: null,
  });
  return updated;
}

export async function stopScreenShare(sessionId: string): Promise<void> {
  const active = activeScreenShare;
  if (!active || active.session.sessionId !== sessionId) return;
  active.stopping = true;
  activeScreenShare = null;
  await active.room.disconnect(true).catch(() => undefined);
  emitLifecycle({
    state: "idle",
    sessionId,
    sourceLabel: null,
    sourceKind: null,
    audioPublished: false,
    audioUnavailableReason: null,
    settings: null,
    message: null,
    failure: null,
    diagnostics: active.session.diagnostics ?? null,
  });
}

export function listenForScreenShareLifecycle(
  onEvent: (event: ScreenShareLifecycleEvent) => void,
): Promise<UnlistenFn> {
  if (!isDesktopRuntime()) return Promise.resolve(() => undefined);
  lifecycleListeners.add(onEvent);
  return Promise.resolve(() => lifecycleListeners.delete(onEvent));
}

async function endUnexpectedScreenShare(
  sessionId: string,
  message: string,
): Promise<void> {
  const active = activeScreenShare;
  if (!active || active.session.sessionId !== sessionId || active.stopping) {
    return;
  }
  active.stopping = true;
  activeScreenShare = null;
  await active.room.disconnect(true).catch(() => undefined);
  const failure = parseScreenShareFailure(message);
  emitLifecycle({
    state: "error",
    sessionId,
    sourceLabel: null,
    sourceKind: null,
    audioPublished: false,
    audioUnavailableReason: null,
    settings: null,
    message,
    failure,
    diagnostics: active.session.diagnostics ?? null,
  });
}

function emitLifecycle(event: ScreenShareLifecycleEvent): void {
  if (event.failure) {
    console.error(
      `[Bakbak screen share] ${event.failure.code}: ${event.failure.message}`,
    );
  }
  for (const listener of lifecycleListeners) listener(event);
}

export function defaultScreenShareCapabilities(): ScreenShareCapabilities {
  return {
    available: false,
    nativeCapture: false,
    systemAudio: false,
    sourceKinds: [],
    resolutions: [...SCREEN_SHARE_RESOLUTIONS],
    frameRates: [...SCREEN_SHARE_FRAME_RATES],
    dynamicSettings: false,
    customPicker: false,
    reason: "Screen sharing is available in the installed desktop app.",
  };
}

export function defaultScreenShareSettings(): ScreenShareSettings {
  return { ...DEFAULT_SCREEN_SHARE_SETTINGS };
}

export function parseScreenShareFailure(caught: unknown): ScreenShareFailure {
  if (isFailureRecord(caught)) return caught;
  const raw =
    caught instanceof Error
      ? caught.message
      : typeof caught === "string" && caught.trim()
        ? caught
        : "Native screen sharing failed without an error message.";
  const match = raw.match(
    /^\[(capture-black|cursor-unavailable|audio-isolation-unavailable|capture-failed)\]\s*(.*)$/s,
  );
  const code = (match?.[1] ?? "capture-failed") as ScreenShareFailureCode;
  return {
    code,
    message: match?.[2]?.trim() || raw,
    recommendedRetrySource: code === "capture-black" ? "display" : null,
  };
}

function isFailureRecord(value: unknown): value is ScreenShareFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value.code === "capture-black" ||
      value.code === "cursor-unavailable" ||
      value.code === "audio-isolation-unavailable" ||
      value.code === "capture-failed") &&
    "message" in value &&
    typeof value.message === "string" &&
    "recommendedRetrySource" in value &&
    (value.recommendedRetrySource === "display" ||
      value.recommendedRetrySource === null)
  );
}

function logDiagnostics(diagnostics: ScreenShareDiagnostics): void {
  console.info("[Bakbak screen share diagnostics]", diagnostics);
}

export const screenShareServiceTesting = {
  async reset(): Promise<void> {
    const active = activeScreenShare;
    activeScreenShare = null;
    lifecycleListeners.clear();
    await active?.room.disconnect(true).catch(() => undefined);
  },
};
