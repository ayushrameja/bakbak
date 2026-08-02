import {
  MonitorUp,
  Music2,
  PhoneOff,
  Video,
  VideoOff,
  Wifi,
} from "lucide-react";
import type { useVoiceRoom } from "./useVoiceRoom";

interface SidebarVoicePanelProps {
  voice: ReturnType<typeof useVoiceRoom>;
  soundboardOpen: boolean;
  onToggleSoundboard: () => void;
  onOpenScreenShare: () => void;
}

export function SidebarVoicePanel({
  voice,
  soundboardOpen,
  onToggleSoundboard,
  onOpenScreenShare,
}: SidebarVoicePanelProps) {
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
  return (
    <section
      className="sidebar-voice-panel"
      data-state={voice.status}
      aria-label="Current voice call"
      aria-live="polite"
    >
      <div className="sidebar-voice-panel__status">
        <Wifi size={26} aria-hidden="true" />
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
      <div className="sidebar-voice-panel__actions" aria-label="Call actions">
        <button
          className={voice.cameraEnabled ? "is-selected" : ""}
          type="button"
          aria-label={
            voice.cameraEnabled ? "Turn camera off" : "Turn camera on"
          }
          disabled={!connected || voice.cameraPending}
          onClick={() => void voice.toggleCamera()}
        >
          {voice.cameraEnabled ? <VideoOff size={17} /> : <Video size={17} />}
        </button>
        <button
          className={voice.screenShareEnabled ? "is-selected" : ""}
          type="button"
          aria-label={
            voice.screenShareEnabled ? "Stop sharing" : "Share screen"
          }
          disabled={
            !connected ||
            voice.screenSharePending ||
            (!voice.screenShareAvailable && !voice.screenShareEnabled)
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
          aria-label={soundboardOpen ? "Close soundboard" : "Open soundboard"}
          aria-expanded={soundboardOpen}
          aria-controls="soundboard-drawer"
          disabled={!connected}
          onClick={onToggleSoundboard}
        >
          <Music2 size={17} />
        </button>
      </div>
    </section>
  );
}
