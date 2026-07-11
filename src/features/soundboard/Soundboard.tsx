import { Radio, Volume2 } from "lucide-react";
import { useState } from "react";
import { bundledSounds } from "./sounds";

interface SoundboardProps {
  connected: boolean;
  onPlay: (soundId: string) => Promise<void>;
}

export function Soundboard({ connected, onPlay }: SoundboardProps) {
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function play(soundId: string) {
    setError(null);
    try {
      await onPlay(soundId);
      setActiveSound(soundId);
      window.setTimeout(() => setActiveSound(null), 520);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That sound missed its cue.",
      );
    }
  }

  return (
    <section className="soundboard-card">
      <header>
        <div>
          <span className="eyebrow">Shared soundboard</span>
          <h3>Perfectly timed nonsense</h3>
        </div>
        <span className={`soundboard-status ${connected ? "online" : ""}`}>
          <Radio size={14} /> {connected ? "Room synced" : "Join to sync"}
        </span>
      </header>
      <div className="sound-grid">
        {bundledSounds.map((sound) => (
          <button
            className={`sound-button sound-button--${sound.color} ${activeSound === sound.id ? "is-playing" : ""}`}
            key={sound.id}
            type="button"
            onClick={() => void play(sound.id)}
          >
            <span>{sound.emoji}</span>
            <strong>{sound.label}</strong>
            <i>
              <Volume2 size={12} /> bundled
            </i>
          </button>
        ))}
      </div>
      {error ? (
        <p className="soundboard-error">{error}</p>
      ) : (
        <p className="soundboard-note">
          Everyone in the room hears the same bundled clip. No uploads, no
          mystery files.
        </p>
      )}
    </section>
  );
}
