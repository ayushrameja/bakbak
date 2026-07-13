import {
  LoaderCircle,
  Pencil,
  Radio,
  RotateCcw,
  Search,
  Square,
  Volume2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Modal } from "../../components/Modal";
import type {
  SoundboardCategory,
  SoundboardMetadataInput,
  SoundboardSound,
} from "./types";

interface SoundboardProps {
  connected: boolean;
  deafened?: boolean;
  categories: SoundboardCategory[];
  sounds: SoundboardSound[];
  loading: boolean;
  error: string | null;
  volume: number;
  activeLocalSoundCount: number;
  onPlay: (soundId: string) => Promise<void>;
  onStopAll: () => Promise<void>;
  onVolumeChange: (volume: number) => void;
  onRetry: (soundId: string) => Promise<void>;
  onUpdate: (soundId: string, input: SoundboardMetadataInput) => Promise<void>;
}

export function Soundboard({
  connected,
  deafened = false,
  categories,
  sounds,
  loading,
  error: catalogError,
  volume,
  activeLocalSoundCount,
  onPlay,
  onStopAll,
  onVolumeChange,
  onRetry,
  onUpdate,
}: SoundboardProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingSound, setEditingSound] = useState<SoundboardSound | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const visibleSounds = useMemo(
    () =>
      sounds.filter((sound) => {
        const inCategory =
          selectedCategoryId === "all" ||
          sound.categoryId === selectedCategoryId;
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return (
          inCategory &&
          (!normalizedQuery ||
            sound.label.toLocaleLowerCase().includes(normalizedQuery) ||
            sound.emoji.includes(normalizedQuery))
        );
      }),
    [query, selectedCategoryId, sounds],
  );

  async function play(sound: SoundboardSound) {
    setError(null);
    if (sound.assetStatus === "error") {
      await onRetry(sound.id);
      return;
    }
    try {
      await onPlay(sound.id);
      setActiveSound(sound.id);
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
        <div className="soundboard-header-actions">
          <label className="soundboard-volume">
            <Volume2 size={14} />
            <span>{Math.round(volume * 100)}%</span>
            <input
              aria-label="Soundboard volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
            />
          </label>
          {activeLocalSoundCount > 0 ? (
            <button
              className="soundboard-stop"
              type="button"
              onClick={() => void onStopAll()}
            >
              <Square size={12} /> Stop my sounds ({activeLocalSoundCount})
            </button>
          ) : null}
          <span className={`soundboard-status ${connected ? "online" : ""}`}>
            <Radio size={14} />
            {connected
              ? deafened
                ? "Sending silently"
                : "Room synced"
              : "Join to sync"}
          </span>
        </div>
      </header>

      <div className="soundboard-tools">
        <label className="soundboard-search">
          <Search size={15} />
          <input
            aria-label="Search sounds"
            value={query}
            placeholder="Find the perfect interruption"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="soundboard-categories" aria-label="Sound categories">
          <button
            className={selectedCategoryId === "all" ? "is-active" : ""}
            type="button"
            onClick={() => setSelectedCategoryId("all")}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              className={selectedCategoryId === category.id ? "is-active" : ""}
              key={category.id}
              type="button"
              onClick={() => setSelectedCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {loading && sounds.length === 0 ? (
        <div className="soundboard-loading">
          <LoaderCircle size={18} /> Loading the nonsense library…
        </div>
      ) : (
        <div className="sound-grid">
          {visibleSounds.length === 0 ? (
            <p className="soundboard-empty">No sound matches that search.</p>
          ) : null}
          {visibleSounds.map((sound) => (
            <div className="sound-card" key={sound.id}>
              <button
                className={`sound-button ${activeSound === sound.id ? "is-playing" : ""}`}
                type="button"
                disabled={sound.assetStatus === "loading"}
                onClick={() => void play(sound)}
                aria-label={`${sound.label}${sound.assetStatus === "error" ? ", retry download" : ""}`}
              >
                <span>{sound.emoji}</span>
                <strong>{sound.label}</strong>
                <i>
                  {sound.assetStatus === "loading" ? (
                    <LoaderCircle size={12} />
                  ) : sound.assetStatus === "error" ? (
                    <RotateCcw size={12} />
                  ) : (
                    <Volume2 size={12} />
                  )}
                  {sound.assetStatus === "loading"
                    ? "loading"
                    : sound.assetStatus === "error"
                      ? "retry"
                      : "ready"}
                </i>
              </button>
              <button
                className="sound-edit"
                type="button"
                aria-label={`Edit ${sound.label}`}
                onClick={() => setEditingSound(sound)}
              >
                <Pencil size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error || catalogError ? (
        <p className="soundboard-error">{error ?? catalogError}</p>
      ) : (
        <p className="soundboard-note">
          {deafened
            ? "Friends still receive sounds you send while your local monitor stays silent."
            : "Sounds use the call path once, with your own local volume."}
        </p>
      )}

      {editingSound ? (
        <EditSoundModal
          sound={editingSound}
          categories={categories}
          onSave={async (input) => {
            await onUpdate(editingSound.id, input);
            setEditingSound(null);
          }}
          onClose={() => setEditingSound(null)}
        />
      ) : null}
    </section>
  );
}

function EditSoundModal({
  sound,
  categories,
  onSave,
  onClose,
}: {
  sound: SoundboardSound;
  categories: SoundboardCategory[];
  onSave: (input: SoundboardMetadataInput) => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(sound.label);
  const [emoji, setEmoji] = useState(sound.emoji);
  const [categoryId, setCategoryId] = useState(sound.categoryId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ label, emoji, categoryId });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Sound metadata did not save.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit sound"
      description="Everyone in this server will see the new label, emoji, and category."
      onClose={onClose}
    >
      <form
        className="sound-edit-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>Name</span>
          <input
            value={label}
            maxLength={50}
            required
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          <span>Emoji</span>
          <input
            value={emoji}
            maxLength={16}
            required
            onChange={(event) => setEmoji(event.target.value)}
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="settings-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
