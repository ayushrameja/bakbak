import {
  MonitorUp,
  Music2,
  PhoneOff,
  Video,
  VideoOff,
  Wifi,
} from "lucide-react";
import { appConfig } from "../../lib/env";
import type { DataMode } from "../../lib/types";
import {
  backendLatencyLabel,
  useBackendLatency,
} from "../server/backend-latency";
import type { useVoiceRoom } from "./useVoiceRoom";

interface SidebarVoicePanelProps {
  voice: ReturnType<typeof useVoiceRoom>;
  mode: DataMode;
  soundboardOpen: boolean;
  onToggleSoundboard: () => void;
  onOpenScreenShare: () => void;
}

export function SidebarVoicePanel({
  voice,
  mode,
  soundboardOpen,
  onToggleSoundboard,
  onOpenScreenShare,
}: SidebarVoicePanelProps) {
  const latency = useBackendLatency(mode, appConfig.supabaseUrl);
  const active = Boolean(voice.channel) && voice.status !== "disconnected";
  if (!active || !voice.channel) return null;

  const connected = voice.status === "connected";
  const statusLabel =
    voice.status === "connecting"
      ? "Connecting"
      : voice.status === "reconnecting"
        ? "Reconnecting"
        : voice.status === "error"
          ? "Needs attention"
          : "Voice connected";
  const qualityLabel =
    voice.status === "reconnecting"
      ? "Reconnecting"
      : voice.connectionQuality === "unknown"
        ? "Checking"
        : `${voice.connectionQuality[0]?.toUpperCase()}${voice.connectionQuality.slice(1)}`;
  const backendLabel = backendLatencyLabel(mode, latency);

  return (
    <section
      className="sidebar-voice-panel"
      data-state={voice.status}
      aria-label="Current voice call"
    >
      <div className="sidebar-voice-panel__status">
        <div>
          <strong>{statusLabel}</strong>
          <span>{voice.channel.name}</span>
        </div>
        <button
          className="sidebar-voice-panel__leave"
          type="button"
          aria-label="Leave voice"
          onClick={() => void voice.leave()}
        >
          <PhoneOff size={16} />
        </button>
      </div>
      <div
        className="sidebar-voice-panel__quality"
        role="status"
        tabIndex={0}
        aria-label={`Voice quality ${qualityLabel}; backend latency ${backendLabel}`}
      >
        <Wifi size={14} />
        <span>{qualityLabel}</span>
        <small>
          Backend {backendLabel} · {appConfig.backendRegion}
        </small>
      </div>
      <div className="sidebar-voice-panel__actions">
        <button
          className={voice.cameraEnabled ? "is-selected" : ""}
          type="button"
          disabled={!connected || voice.cameraPending}
          aria-label={
            voice.cameraEnabled ? "Turn camera off" : "Turn camera on"
          }
          onClick={() => void voice.toggleCamera()}
        >
          {voice.cameraEnabled ? <VideoOff size={17} /> : <Video size={17} />}
        </button>
        <button
          className={voice.screenShareEnabled ? "is-selected" : ""}
          type="button"
          disabled={
            !connected ||
            voice.screenSharePending ||
            (!voice.screenShareAvailable && !voice.screenShareEnabled)
          }
          aria-label={
            voice.screenShareEnabled ? "Stop sharing" : "Share screen"
          }
          onClick={() => {
            if (voice.screenShareEnabled) void voice.stopScreenShare();
            else onOpenScreenShare();
          }}
        >
          <MonitorUp size={17} />
        </button>
        <button
          className={soundboardOpen ? "is-selected" : ""}
          type="button"
          disabled={!connected}
          aria-label={soundboardOpen ? "Close soundboard" : "Open soundboard"}
          aria-expanded={soundboardOpen}
          aria-controls="soundboard-drawer"
          onClick={onToggleSoundboard}
        >
          <Music2 size={17} />
        </button>
      </div>
    </section>
  );
}
