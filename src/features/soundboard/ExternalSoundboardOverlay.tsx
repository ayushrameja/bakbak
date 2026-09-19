import {
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  Mouse,
  Square,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getDesktopBridge } from "../../lib/desktop-runtime";
import type {
  ExternalAudioLevels,
  ExternalAudioSessionState,
  ExternalOverlayInteraction,
} from "../../lib/external-audio-types";
import {
  EXTERNAL_AUDIO_OVERLAY_CHANNEL,
  parseExternalAudioOverlayMessage,
  type ExternalAudioOverlayCatalog,
} from "./external-audio-overlay-channel";
import {
  loadWheelPage,
  saveWheelPage,
  soundWheelPages,
  wheelSegment,
  wrapPage,
} from "./external-sound-wheel";

import { SoundWheelScroll } from "./sound-wheel-scroll";

const IDLE: ExternalAudioSessionState = {
  status: "idle",
  config: null,
  microphoneMuted: false,
  activeSoundId: null,
  errorCode: null,
  message: null,
};
const CLOSED: ExternalOverlayInteraction = {
  id: 0,
  phase: "closed",
  mode: "browse",
};
const phaseOrder = { open: 0, released: 1, closed: 2 };

export function ExternalSoundboardOverlay() {
  const api = getDesktopBridge()?.externalAudio;
  const [state, setState] = useState(IDLE);
  const [levels, setLevels] = useState<ExternalAudioLevels>({
    microphone: 0,
    output: 0,
    clipping: false,
  });
  const [catalog, setCatalog] = useState<ExternalAudioOverlayCatalog>({
    type: "catalog",
    scopeId: "local",
    categories: [],
    sounds: [],
    recentSoundIds: [],
  });
  const [pageKey, setPageKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState(CLOSED);
  const [error, setError] = useState<string | null>(null);
  const [playPending, setPlayPending] = useState(false);
  const root = useRef<HTMLElement>(null);
  const interactionRef = useRef(CLOSED);
  const finishing = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const scopeRef = useRef<string | null>(null);
  const wheelGesture = useRef(new SoundWheelScroll());
  const pages = useMemo(() => soundWheelPages(catalog), [catalog]);
  const pageIndex = Math.max(
    0,
    pages.findIndex((page) => page.key === pageKey),
  );
  const page = pages[pageIndex];
  const selected =
    page?.sounds.find((sound) => sound.id === selectedId) ?? page?.sounds[0];
  const view = useRef({ state, selected, first: page?.sounds[0] });
  useLayoutEffect(() => {
    view.current = { state, selected, first: page?.sounds[0] };
  }, [state, selected, page]);

  const finish = useCallback(
    (play: boolean, soundId?: string) => {
      if (!api) return;
      const current = interactionRef.current;
      if (current.phase === "closed" || finishing.current === current.id)
        return;
      finishing.current = current.id;
      const sound = view.current.selected;
      const target = soundId ?? sound?.id;
      const playable =
        play &&
        view.current.state.status === "live" &&
        Boolean(target) &&
        (soundId !== undefined || sound?.assetStatus === "ready");
      // Native claim closes the wheel and fences click/release races and stale
      // hidden-webview messages before we ask the main audio owner to play.
      void api
        .finishOverlayInteraction(current.id, playable)
        .then((claimed) => {
          if (!playable || !claimed || !target) return;
          setError(null);
          setPlayPending(true);
          channelRef.current?.postMessage({ type: "play", soundId: target });
        })
        .catch(() => {
          finishing.current = null;
          setError(
            "The sound wheel could not close. Press Escape to try again.",
          );
        });
    },
    [api],
  );

  useEffect(() => {
    if (!api) return;
    let active = true;
    const offState = api.onState((next) => {
      if (active) setState(next);
    });
    const offLevels = api.onLevels((next) => {
      if (active) setLevels(next);
    });
    void api
      .getState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setError("Could not read external audio state.");
      });
    return () => {
      active = false;
      offState();
      offLevels();
    };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    let active = true;
    const receive = (next: ExternalOverlayInteraction) => {
      if (!active) return;
      const previous = interactionRef.current;
      if (
        next.id < previous.id ||
        (next.id === previous.id &&
          phaseOrder[next.phase] < phaseOrder[previous.phase])
      )
        return;
      const opened = next.id !== previous.id;
      interactionRef.current = next;
      setInteraction(next);
      if (opened) {
        finishing.current = null;
        setSelectedId(null);
        // A quick release while the webview loads must not play a stale hover.
        view.current.selected = view.current.first;
        wheelGesture.current.reset();
        if (next.phase === "open") root.current?.focus();
      }
      if (next.phase === "released") finish(true);
    };
    const off = api.onOverlayInteraction(receive);
    void api
      .getOverlayInteraction()
      .then(receive)
      .catch(() => {
        if (active) setError("Could not connect the wheel shortcut.");
      });
    return () => {
      active = false;
      off();
    };
  }, [api, finish]);

  useEffect(() => {
    if (state.status !== "live" || state.activeSoundId) setPlayPending(false);
  }, [state.activeSoundId, state.status]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(EXTERNAL_AUDIO_OVERLAY_CHANNEL);
    channelRef.current = channel;
    let loaded = false;
    const announce = () => channel.postMessage({ type: "ready" });
    channel.onmessage = ({ data }) => {
      const message = parseExternalAudioOverlayMessage(data);
      if (message?.type === "catalog") {
        loaded = message.sounds.length > 0;
        if (scopeRef.current !== message.scopeId) {
          scopeRef.current = message.scopeId;
          setPageKey(loadWheelPage(message.scopeId));
          setSelectedId(null);
        }
        setCatalog(message);
      } else if (message?.type === "play-error") {
        setPlayPending(false);
        setError(message.message);
      }
    };
    announce();
    const timer = window.setInterval(() => {
      if (!loaded) announce();
    }, 750);
    return () => {
      window.clearInterval(timer);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const navigate = useCallback(
    (direction: number) => {
      if (!pages.length) return;
      const next = pages[wrapPage(pageIndex, direction, pages.length)];
      if (!next) return;
      setPageKey(next.key);
      setSelectedId(null);
      view.current.selected = next.sounds[0];
      saveWheelPage(catalog.scopeId, next.key);
      void api?.selectionFeedback().catch(() => undefined);
    },
    [api, catalog.scopeId, pageIndex, pages],
  );

  useEffect(() => {
    const element = root.current;
    if (!api || !element) return;
    const onWheel = (event: WheelEvent) => {
      // React delegates wheel events passively. An explicit non-passive listener
      // also prevents held Ctrl/Shift from zooming or panning the webview.
      event.preventDefault();
      event.stopPropagation();
      const direction = wheelGesture.current.step(event);
      if (direction) navigate(direction);
    };
    element.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });
    return () => element.removeEventListener("wheel", onWheel, true);
  }, [api, navigate]);

  function select(soundId: string) {
    const sound = page?.sounds.find(({ id }) => id === soundId);
    if (!sound || sound.id === view.current.selected?.id) return;
    setSelectedId(soundId);
    view.current.selected = sound;
    void api?.selectionFeedback().catch(() => undefined);
  }
  function stopSound() {
    setPlayPending(false);
    channelRef.current?.postMessage({ type: "stop-sound" });
  }

  if (!api)
    return (
      <main className="external-overlay external-overlay--unavailable">
        External Soundboard is unavailable in this runtime.
      </main>
    );

  return (
    <main
      ref={root}
      tabIndex={-1}
      className="external-overlay"
      aria-label="External sound wheel"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          navigate(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          navigate(-1);
        } else if (/^[1-6]$/.test(event.key)) {
          event.preventDefault();
          const sound = page?.sounds[Number(event.key) - 1];
          if (sound) select(sound.id);
        } else if (event.key === "Enter" && event.target === root.current) {
          event.preventDefault();
          finish(true);
        }
      }}
    >
      <header className="external-overlay__header">
        <div>
          <span className={state.status === "live" ? "is-live" : ""}>
            {state.status === "live" ? "LIVE" : state.status}
          </span>
          <strong>
            BAKBAK <span>SOUND WHEEL</span>
          </strong>
        </div>
        <button
          type="button"
          aria-label="Close sound wheel without playing"
          onClick={() => finish(false)}
        >
          <X size={20} />
        </button>
      </header>

      <div className="sound-wheel__stage">
        <div className="sound-wheel__heading">
          <span>YOUR NEXT PERFECTLY TIMED INTERRUPTION</span>
          <h1>{page?.category ?? "Sound wheel"}</h1>
          <p>
            {page
              ? `Page ${page.number} of ${page.total} in this category`
              : "Open Bakbak to load your sounds"}
          </p>
        </div>
        <div
          className="sound-wheel"
          role="group"
          aria-label={page ? `${page.category} sounds` : "Sounds"}
        >
          {Array.from({ length: 6 }, (_, index) => {
            const sound = page?.sounds[index];
            const angle = ((-90 + index * 60) * Math.PI) / 180;
            const style = { clipPath: wheelSegment(index) };
            if (!sound)
              return (
                <div
                  key={index}
                  className="sound-wheel__segment is-empty"
                  style={style}
                  aria-hidden="true"
                />
              );
            return (
              <button
                key={`${page?.key}:${sound.id}`}
                type="button"
                className={`sound-wheel__segment${selected?.id === sound.id ? " is-selected" : ""}${state.activeSoundId === sound.id ? " is-playing" : ""}`}
                style={style}
                aria-label={`Play ${sound.label}`}
                aria-pressed={selected?.id === sound.id}
                aria-disabled={
                  sound.assetStatus !== "ready" || state.status !== "live"
                }
                onPointerEnter={() => select(sound.id)}
                onFocus={() => select(sound.id)}
                onClick={() => {
                  select(sound.id);
                  if (sound.assetStatus === "ready") finish(true, sound.id);
                }}
              >
                <span
                  className="sound-wheel__sound"
                  style={{
                    left: `${50 + 35.5 * Math.cos(angle)}%`,
                    top: `${50 + 35.5 * Math.sin(angle)}%`,
                  }}
                >
                  <span className="sound-wheel__emoji">{sound.emoji}</span>
                  <strong>{sound.label}</strong>
                  <small>
                    {sound.assetStatus === "ready"
                      ? `0${index + 1}`
                      : sound.assetStatus === "loading"
                        ? "Loading"
                        : "Unavailable"}
                  </small>
                </span>
              </button>
            );
          })}
          <div className="sound-wheel__center" aria-live="polite">
            <span className="sound-wheel__center-emoji">
              {selected?.emoji ?? "◌"}
            </span>
            <strong>{selected?.label ?? "No sounds yet"}</strong>
            <span>
              {state.status !== "live"
                ? "Start External Soundboard in Bakbak"
                : selected?.assetStatus !== "ready"
                  ? "Sound unavailable"
                  : interaction.mode === "hold"
                    ? "Release to play"
                    : "Click to play"}
            </span>
          </div>
        </div>
        <nav className="sound-wheel__pagination" aria-label="Sound sections">
          <button
            type="button"
            aria-label="Previous section"
            disabled={pages.length < 2}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <strong>
              {String(pages.length ? pageIndex + 1 : 0).padStart(2, "0")}{" "}
              <span>/ {String(pages.length).padStart(2, "0")}</span>
            </strong>
            <span>SCROLL ↑ NEXT · ↓ PREVIOUS</span>
          </div>
          <button
            type="button"
            aria-label="Next section"
            disabled={pages.length < 2}
            onClick={() => navigate(1)}
          >
            <ChevronRight size={18} />
          </button>
        </nav>
      </div>

      {error || state.message ? (
        <p className="external-overlay__error" role="alert">
          {error ?? state.message}
        </p>
      ) : null}
      <footer className="external-overlay__footer">
        <section
          className="external-overlay__mic"
          aria-label="External microphone"
        >
          <button
            type="button"
            aria-label={
              state.microphoneMuted ? "Unmute microphone" : "Mute microphone"
            }
            disabled={state.status !== "live"}
            onClick={() =>
              void api
                .update({ microphoneMuted: !state.microphoneMuted })
                .catch(() => setError("Could not change microphone mute."))
            }
          >
            {state.microphoneMuted ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <div>
            <span>{state.microphoneMuted ? "MIC MUTED" : "MIC LIVE"}</span>
            <meter
              aria-label="Microphone level"
              min="0"
              max="1"
              value={state.microphoneMuted ? 0 : levels.microphone}
            />
          </div>
        </section>
        <p>
          <Mouse size={15} /> Point to select <span>·</span> Click or release to
          play <span>·</span> Esc cancels
        </p>
        <div className="external-overlay__actions">
          <button
            type="button"
            disabled={!state.activeSoundId && !playPending}
            onClick={stopSound}
          >
            <Square size={13} /> Stop sound
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              finish(false);
              void api
                .stop()
                .catch(() => setError("Could not stop external audio."));
            }}
          >
            Stop mic
          </button>
        </div>
      </footer>
    </main>
  );
}
