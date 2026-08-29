import { Mic, MicOff, Search, Square, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getDesktopBridge } from "../../lib/desktop-runtime";
import type {
  ExternalAudioLevels,
  ExternalAudioSessionState,
} from "../../lib/external-audio-types";
import {
  EXTERNAL_AUDIO_OVERLAY_CHANNEL,
  parseExternalAudioOverlayMessage,
  type ExternalAudioOverlayCatalog,
} from "./external-audio-overlay-channel";

const IDLE: ExternalAudioSessionState = {
  status: "idle",
  config: null,
  microphoneMuted: false,
  activeSoundId: null,
  errorCode: null,
  message: null,
};

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
    sounds: [],
    recentSoundIds: [],
  });
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [playPending, setPlayPending] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    const offState = api.onState((next) => active && setState(next));
    const offLevels = api.onLevels((next) => active && setLevels(next));
    void api.getState().then((next) => active && setState(next));
    return () => {
      active = false;
      offState();
      offLevels();
    };
  }, [api]);

  useEffect(() => {
    if (state.status !== "live" || state.activeSoundId) {
      setPlayPending(false);
    }
  }, [state.activeSoundId, state.status]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(EXTERNAL_AUDIO_OVERLAY_CHANNEL);
    const announce = () => channel.postMessage({ type: "ready" });
    announce();
    const timer = window.setInterval(() => {
      if (catalog.sounds.length === 0) announce();
    }, 750);
    channel.onmessage = ({ data }) => {
      const message = parseExternalAudioOverlayMessage(data);
      if (message?.type === "catalog") {
        setCatalog(message);
        setError(null);
      } else if (message?.type === "play-error") {
        setPlayPending(false);
        setError(message.message);
      }
    };
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, [catalog.sounds.length]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sections = useMemo(() => {
    const matches = catalog.sounds.filter(
      (sound) =>
        !normalizedQuery ||
        sound.label.toLocaleLowerCase().includes(normalizedQuery) ||
        sound.emoji.includes(normalizedQuery),
    );
    const byId = new Map(matches.map((sound) => [sound.id, sound]));
    return [
      {
        label: "Favorites",
        sounds: matches.filter((sound) => sound.favorite),
      },
      {
        label: "Recent",
        sounds: catalog.recentSoundIds.flatMap((id) => {
          const sound = byId.get(id);
          return sound ? [sound] : [];
        }),
      },
      { label: "All sounds", sounds: matches },
    ].filter((section) => section.sounds.length > 0);
  }, [catalog, normalizedQuery]);

  function play(soundId: string) {
    setError(null);
    setPlayPending(true);
    const channel = new BroadcastChannel(EXTERNAL_AUDIO_OVERLAY_CHANNEL);
    channel.postMessage({ type: "play", soundId });
    channel.close();
  }

  function stopSound() {
    setPlayPending(false);
    const channel = new BroadcastChannel(EXTERNAL_AUDIO_OVERLAY_CHANNEL);
    channel.postMessage({ type: "stop-sound" });
    channel.close();
  }

  if (!api) {
    return (
      <main className="external-overlay external-overlay--unavailable">
        External Soundboard is unavailable in this runtime.
      </main>
    );
  }

  return (
    <main className="external-overlay" data-tauri-drag-region>
      <header className="external-overlay__header" data-tauri-drag-region>
        <div>
          <span className={state.status === "live" ? "is-live" : ""}>
            {state.status === "live" ? "LIVE" : state.status}
          </span>
          <strong>External Soundboard</strong>
        </div>
        <button
          type="button"
          aria-label="Hide External Soundboard"
          onClick={() => void api.hideOverlay()}
        >
          <X size={15} />
        </button>
      </header>

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
            void api.update({ microphoneMuted: !state.microphoneMuted })
          }
        >
          {state.microphoneMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <div>
          <span>
            {state.microphoneMuted ? "Microphone muted" : "Physical microphone"}
          </span>
          <meter
            min="0"
            max="1"
            value={state.microphoneMuted ? 0 : levels.microphone}
          />
        </div>
      </section>

      <label className="external-overlay__search">
        <Search size={14} />
        <input
          aria-label="Search external soundboard"
          value={query}
          placeholder="Find a sound"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="external-overlay__sounds">
        {sections.length ? (
          sections.map((section) => (
            <section key={section.label}>
              <h2>{section.label}</h2>
              <div>
                {section.sounds.map((sound) => (
                  <button
                    key={`${section.label}:${sound.id}`}
                    type="button"
                    disabled={
                      sound.assetStatus !== "ready" || state.status !== "live"
                    }
                    className={
                      state.activeSoundId === sound.id ? "is-playing" : ""
                    }
                    onClick={() => play(sound.id)}
                  >
                    <span>{sound.emoji}</span>
                    <strong>{sound.label}</strong>
                    <Volume2 size={12} />
                  </button>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p>
            {normalizedQuery
              ? "No sound matches."
              : "Open Bakbak to load sounds."}
          </p>
        )}
      </div>

      {error || state.message ? (
        <p className="external-overlay__error" role="alert">
          {error ?? state.message}
        </p>
      ) : null}

      <footer>
        <button
          type="button"
          disabled={!state.activeSoundId && !playPending}
          onClick={stopSound}
        >
          <Square size={13} /> Stop sound
        </button>
        <button
          className="danger"
          type="button"
          onClick={() => void api.stop()}
        >
          Stop External Mic
        </button>
      </footer>
    </main>
  );
}
