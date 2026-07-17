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
  Square,
  Video,
  VideoOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import type { useVoiceRoom } from "./useVoiceRoom";

export const VOICE_DOCK_HIDE_DELAY_MS = 2_500;
const ACTIVATION_ZONE_PX = 96;

interface VoiceControlDockProps {
  voice: ReturnType<typeof useVoiceRoom>;
  soundboardOpen: boolean;
  overTextChannel: boolean;
  onToggleSoundboard: () => void;
  onOpenDevices: () => void;
  onOpenScreenShare: () => void;
}

export function VoiceControlDock({
  voice,
  soundboardOpen,
  overTextChannel,
  onToggleSoundboard,
  onOpenDevices,
  onOpenScreenShare,
}: VoiceControlDockProps) {
  const [visible, setVisible] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const soundboardButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const active = Boolean(voice.channel) && voice.status !== "disconnected";
  const connected = voice.status === "connected";
  const localSoundsActive = voice.activeLocalSoundCount > 0;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (
      pointerInsideRef.current ||
      focusInsideRef.current ||
      moreOpen ||
      soundboardOpen ||
      localSoundsActive
    )
      return;
    hideTimerRef.current = window.setTimeout(
      () => setVisible(false),
      VOICE_DOCK_HIDE_DELAY_MS,
    );
  }, [clearHideTimer, localSoundsActive, moreOpen, soundboardOpen]);

  const reveal = useCallback(() => {
    if (!active) return;
    setVisible(true);
    scheduleHide();
  }, [active, scheduleHide]);

  useEffect(() => {
    if (!active) {
      clearHideTimer();
      setVisible(false);
      setMoreOpen(false);
      return;
    }
    setVisible(true);
    scheduleHide();
  }, [active, clearHideTimer, scheduleHide]);

  useEffect(() => {
    if (!active) return;
    const handlePointerMove = (event: PointerEvent) => {
      const parent = anchorRef.current?.parentElement;
      if (!parent || !(event.target instanceof Element)) return;
      const bounds = parent.getBoundingClientRect();
      const inParent =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;
      const nonInteractive = !event.target.closest(
        "button, input, textarea, select, a, [role='dialog'], [role='menu']",
      );
      if (
        inParent &&
        nonInteractive &&
        event.clientY >= bounds.bottom - ACTIVATION_ZONE_PX
      ) {
        reveal();
      }
    };
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [active, reveal]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    if (soundboardOpen || moreOpen || localSoundsActive) {
      clearHideTimer();
      setVisible(true);
    } else if (active) {
      scheduleHide();
    }
  }, [
    active,
    clearHideTimer,
    localSoundsActive,
    moreOpen,
    scheduleHide,
    soundboardOpen,
  ]);

  useEffect(() => {
    if (!moreOpen) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus();
    const closeMenu = (event: KeyboardEvent | MouseEvent) => {
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
    document.addEventListener("keydown", closeMenu);
    document.addEventListener("mousedown", closeMenu);
    return () => {
      document.removeEventListener("keydown", closeMenu);
      document.removeEventListener("mousedown", closeMenu);
    };
  }, [moreOpen]);

  if (!active || !voice.channel) return null;

  return (
    <div
      ref={anchorRef}
      className={`voice-control-dock-anchor ${overTextChannel ? "is-over-text" : ""}`}
    >
      <section
        ref={dockRef}
        className={`voice-control-dock ${visible ? "is-visible" : ""}`}
        aria-label="Voice controls"
        data-visible={visible}
        onPointerEnter={() => {
          pointerInsideRef.current = true;
          clearHideTimer();
          setVisible(true);
        }}
        onPointerLeave={() => {
          pointerInsideRef.current = false;
          scheduleHide();
        }}
        onFocusCapture={() => {
          focusInsideRef.current = true;
          clearHideTimer();
          setVisible(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            focusInsideRef.current = false;
            scheduleHide();
          }
        }}
      >
        <DockButton
          label={voice.muted ? "Unmute" : "Mute"}
          active={voice.muted}
          disabled={!connected}
          onClick={() => void voice.toggleMute()}
        >
          {voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
        </DockButton>
        <DockButton
          label={voice.cameraEnabled ? "Turn camera off" : "Turn camera on"}
          active={voice.cameraEnabled}
          disabled={!connected || voice.cameraPending}
          onClick={() => void voice.toggleCamera()}
        >
          {voice.cameraEnabled ? <VideoOff size={20} /> : <Video size={20} />}
        </DockButton>
        <DockButton
          label={voice.screenShareEnabled ? "Stop sharing" : "Share screen"}
          active={voice.screenShareEnabled}
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
          <MonitorUp size={20} />
        </DockButton>
        <DockButton
          buttonRef={soundboardButtonRef}
          label={soundboardOpen ? "Close soundboard" : "Open soundboard"}
          active={soundboardOpen}
          disabled={!connected}
          ariaExpanded={soundboardOpen}
          controls="soundboard-drawer"
          onClick={onToggleSoundboard}
        >
          <Music2 size={20} />
        </DockButton>
        <div className="voice-control-dock__more">
          <button
            ref={moreButtonRef}
            className={moreOpen ? "is-active" : ""}
            type="button"
            aria-label="More voice controls"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls="voice-dock-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <Ellipsis size={21} />
          </button>
          {moreOpen ? (
            <div
              ref={menuRef}
              className="voice-control-dock__menu"
              id="voice-dock-more-menu"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                disabled={!connected}
                onClick={() => {
                  setMoreOpen(false);
                  void voice.toggleDeafen();
                }}
              >
                {voice.deafened ? (
                  <HeadphoneOff size={17} />
                ) : (
                  <Headphones size={17} />
                )}
                <span>{voice.deafened ? "Undeafen" : "Deafen"}</span>
              </button>
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
        {localSoundsActive ? (
          <button
            className="voice-control-dock__stop-sounds"
            type="button"
            aria-label={`Stop my sounds (${voice.activeLocalSoundCount} playing)`}
            onClick={() => void voice.stopLocalSounds()}
          >
            <Square size={18} />
            <span>{voice.activeLocalSoundCount}</span>
          </button>
        ) : null}
        <button
          className="voice-control-dock__leave"
          type="button"
          aria-label="Leave voice"
          onClick={() => void voice.leave()}
        >
          <PhoneOff size={20} />
        </button>
      </section>
    </div>
  );
}

function DockButton({
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
    </button>
  );
}
