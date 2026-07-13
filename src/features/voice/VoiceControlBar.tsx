import {
  Ellipsis,
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  Music2,
  PhoneOff,
  Settings2,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import type { useVoiceRoom } from "./useVoiceRoom";

interface VoiceControlBarProps {
  voice: ReturnType<typeof useVoiceRoom>;
  soundboardOpen: boolean;
  onToggleSoundboard: () => void;
  onOpenDevices: () => void;
  onOpenScreenShare: () => void;
}

export function VoiceControlBar({
  voice,
  soundboardOpen,
  onToggleSoundboard,
  onOpenDevices,
  onOpenScreenShare,
}: VoiceControlBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const soundboardButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = Boolean(voice.channel) && voice.status !== "disconnected";
  const connected = voice.status === "connected";

  useEffect(() => {
    if (!moreOpen) {
      return;
    }

    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus();

    const closeMoreMenu = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        moreButtonRef.current?.focus();
        return;
      }

      if (
        event instanceof MouseEvent &&
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !moreButtonRef.current?.contains(event.target)
      ) {
        setMoreOpen(false);
      }
    };

    document.addEventListener("keydown", closeMoreMenu);
    document.addEventListener("mousedown", closeMoreMenu);
    return () => {
      document.removeEventListener("keydown", closeMoreMenu);
      document.removeEventListener("mousedown", closeMoreMenu);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!active) {
      setMoreOpen(false);
    }
  }, [active]);

  useEffect(() => {
    if (!soundboardOpen) return;
    const closeSoundboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) {
        return;
      }
      event.preventDefault();
      onToggleSoundboard();
      soundboardButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeSoundboard);
    return () => document.removeEventListener("keydown", closeSoundboard);
  }, [onToggleSoundboard, soundboardOpen]);

  if (!active || !voice.channel) {
    return null;
  }

  const statusLabel =
    voice.status === "connected"
      ? "Voice connected"
      : voice.status === "connecting"
        ? "Joining voice…"
        : voice.status === "reconnecting"
          ? "Reconnecting…"
          : "Voice needs attention";

  return (
    <section
      className="voice-control-bar"
      data-status={voice.status}
      aria-label="Voice controls"
    >
      <div className="voice-control-bar__room" aria-live="polite">
        <i />
        <div>
          <strong>{statusLabel}</strong>
          <span>{voice.channel.name}</span>
        </div>
      </div>

      <div className="voice-control-bar__actions">
        <ControlButton
          label={voice.muted ? "Unmute" : "Mute"}
          active={voice.muted}
          disabled={!connected}
          onClick={() => void voice.toggleMute()}
        >
          {voice.muted ? <MicOff size={19} /> : <Mic size={19} />}
        </ControlButton>
        <ControlButton
          label={voice.deafened ? "Undeafen" : "Deafen"}
          active={voice.deafened}
          disabled={!connected}
          onClick={() => void voice.toggleDeafen()}
        >
          {voice.deafened ? (
            <HeadphoneOff size={19} />
          ) : (
            <Headphones size={19} />
          )}
        </ControlButton>
        <ControlButton
          buttonRef={soundboardButtonRef}
          label={soundboardOpen ? "Close soundboard" : "Open soundboard"}
          active={soundboardOpen}
          disabled={!connected}
          ariaExpanded={soundboardOpen}
          controls="soundboard-drawer"
          onClick={() => {
            setMoreOpen(false);
            onToggleSoundboard();
          }}
        >
          <Music2 size={19} />
        </ControlButton>

        <div className="voice-control-bar__more">
          <button
            ref={moreButtonRef}
            className={moreOpen ? "is-active" : ""}
            type="button"
            aria-label="More voice controls"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls="voice-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <Ellipsis size={20} />
          </button>
          {moreOpen ? (
            <div
              ref={menuRef}
              className="voice-control-bar__menu"
              id="voice-more-menu"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                disabled={!connected || voice.cameraPending}
                onClick={() => {
                  setMoreOpen(false);
                  void voice.toggleCamera();
                }}
              >
                {voice.cameraEnabled ? (
                  <VideoOff size={17} />
                ) : (
                  <Video size={17} />
                )}
                <span>
                  {voice.cameraPending
                    ? "Camera…"
                    : voice.cameraEnabled
                      ? "Turn camera off"
                      : "Turn camera on"}
                </span>
              </button>
              {voice.screenShareAvailable || voice.screenShareEnabled ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!connected || voice.screenSharePending}
                  onClick={() => {
                    setMoreOpen(false);
                    if (voice.screenShareEnabled) {
                      void voice.stopScreenShare();
                    } else {
                      onOpenScreenShare();
                    }
                  }}
                >
                  <MonitorUp size={17} />
                  <span>
                    {voice.screenSharePending
                      ? "Screen…"
                      : voice.screenShareEnabled
                        ? "Stop sharing"
                        : "Share screen"}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenDevices();
                }}
              >
                <Settings2 size={17} />
                <span>Audio &amp; video settings</span>
              </button>
            </div>
          ) : null}
        </div>

        <button
          className="voice-control-bar__leave"
          type="button"
          onClick={() => {
            setMoreOpen(false);
            void voice.leave();
          }}
          aria-label="Leave voice"
        >
          <PhoneOff size={19} />
          <span>Leave</span>
        </button>
      </div>
    </section>
  );
}

function ControlButton({
  buttonRef,
  label,
  active = false,
  disabled = false,
  ariaExpanded,
  controls,
  onClick,
  children,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  ariaExpanded?: boolean;
  controls?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      className={active ? "is-active" : ""}
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
      aria-controls={controls}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
