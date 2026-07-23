import {
  ChevronDown,
  LoaderCircle,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Square,
  Star,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Modal } from "../../components/Modal";
import type { MembershipRole } from "../../lib/types";
import {
  cancelSoundboardPreparation,
  MAX_SOUNDBOARD_CLIP_SECONDS,
  MIN_SOUNDBOARD_CLIP_SECONDS,
  prepareSoundboardClip,
  validateSoundboardClipWindow,
  validateSoundboardSource,
  type SoundboardPreparationStage,
} from "./soundboard-upload";
import type {
  SoundboardCategory,
  SoundboardMetadataInput,
  SoundboardSound,
  SoundboardUploadInput,
} from "./types";

const FAVORITES_SECTION_ID = "favorites";

interface SoundboardProps {
  serverId: string;
  currentUserId: string;
  currentUserRole: MembershipRole;
  connected: boolean;
  deafened?: boolean;
  categories: SoundboardCategory[];
  sounds: SoundboardSound[];
  favoriteSoundIds: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  volume: number;
  activeLocalSoundCount: number;
  maxConcurrentSounds: number;
  onPlay: (soundId: string) => Promise<void>;
  onStopAll: () => Promise<void>;
  onVolumeChange: (volume: number) => void;
  onRetry: (soundId: string) => Promise<void>;
  onToggleFavorite: (soundId: string) => Promise<void>;
  onUpload: (input: SoundboardUploadInput) => Promise<void>;
  onDelete: (soundId: string) => Promise<void>;
  onUpdate: (soundId: string, input: SoundboardMetadataInput) => Promise<void>;
}

interface SoundSection {
  id: string;
  name: string;
  sounds: SoundboardSound[];
  emptyMessage: string;
}

export function Soundboard({
  serverId,
  currentUserId,
  currentUserRole,
  connected,
  deafened = false,
  categories,
  sounds,
  favoriteSoundIds,
  loading,
  error: catalogError,
  volume,
  activeLocalSoundCount,
  maxConcurrentSounds,
  onPlay,
  onStopAll,
  onVolumeChange,
  onRetry,
  onToggleFavorite,
  onUpload,
  onDelete,
  onUpdate,
}: SoundboardProps) {
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingSound, setEditingSound] = useState<SoundboardSound | null>(
    null,
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >(() => loadCollapsedSections(serverId, categories));
  const [error, setError] = useState<string | null>(null);
  const soundLimitReached = activeLocalSoundCount >= maxConcurrentSounds;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  useEffect(() => {
    setCollapsedSections(loadCollapsedSections(serverId, categories));
  }, [categories, serverId]);

  const sections = useMemo<SoundSection[]>(() => {
    const matchesQuery = (sound: SoundboardSound) =>
      !normalizedQuery ||
      sound.label.toLocaleLowerCase().includes(normalizedQuery) ||
      sound.emoji.includes(normalizedQuery);
    const favoriteSounds = sounds.filter(
      (sound) => favoriteSoundIds.has(sound.id) && matchesQuery(sound),
    );
    const categorySections = categories.map((category) => ({
      id: category.id,
      name: category.name,
      sounds: sounds.filter(
        (sound) => sound.categoryId === category.id && matchesQuery(sound),
      ),
      emptyMessage:
        category.acceptsUploads && !normalizedQuery
          ? "No friend-made sounds yet. This is suspiciously peaceful."
          : "No sound matches that search.",
    }));
    return [
      {
        id: FAVORITES_SECTION_ID,
        name: "Favorites",
        sounds: favoriteSounds,
        emptyMessage: normalizedQuery
          ? "No favorite matches that search."
          : "Star a sound and it will wait here for its big moment.",
      },
      ...categorySections,
    ];
  }, [categories, favoriteSoundIds, normalizedQuery, sounds]);

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
      if (caught instanceof DOMException && caught.name === "AbortError")
        return;
      setError(
        caught instanceof Error ? caught.message : "That sound missed its cue.",
      );
    }
  }

  async function toggleFavorite(soundId: string) {
    setError(null);
    try {
      await onToggleFavorite(soundId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That favorite did not stick.",
      );
    }
  }

  function toggleSection(sectionId: string) {
    setCollapsedSections((current) => {
      const next = { ...current, [sectionId]: !current[sectionId] };
      saveCollapsedSections(serverId, next);
      return next;
    });
  }

  return (
    <section className="soundboard-card" aria-label="Soundboard controls">
      <header className="soundboard-compact-header">
        <label className="soundboard-search">
          <Search size={15} />
          <input
            aria-label="Search sounds"
            value={query}
            placeholder="Find the perfect sound"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="soundboard-header-actions">
          <button
            className="soundboard-upload-button"
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            <Plus size={14} />
            <span>Upload</span>
          </button>
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
          <span
            className={`soundboard-status ${connected ? "online" : ""}`}
            aria-label={
              connected
                ? deafened
                  ? "Soundboard connected; local monitoring muted"
                  : "Soundboard connected"
                : "Join voice to sync sounds"
            }
            title={
              connected
                ? deafened
                  ? "Sending silently"
                  : "Room synced"
                : "Join to sync"
            }
          >
            <Radio size={14} />
          </span>
        </div>
      </header>

      {loading && sounds.length === 0 ? (
        <div className="soundboard-loading">
          <LoaderCircle size={18} /> Loading the nonsense library…
        </div>
      ) : (
        <div className="soundboard-sections">
          {sections.map((section) => {
            if (normalizedQuery && section.sounds.length === 0) return null;
            const collapsed =
              !normalizedQuery && Boolean(collapsedSections[section.id]);
            const panelId = `soundboard-section-${section.id}`;
            return (
              <section className="soundboard-section" key={section.id}>
                <button
                  className="soundboard-section__header"
                  type="button"
                  aria-expanded={!collapsed}
                  aria-controls={panelId}
                  onClick={() => toggleSection(section.id)}
                >
                  <ChevronDown
                    className={collapsed ? "is-collapsed" : ""}
                    size={15}
                  />
                  <span>{section.name}</span>
                  <small>{section.sounds.length}</small>
                </button>
                <div id={panelId} hidden={collapsed}>
                  {section.sounds.length === 0 ? (
                    <p className="soundboard-empty">{section.emptyMessage}</p>
                  ) : (
                    <div className="sound-grid">
                      {section.sounds.map((sound) => {
                        const favorited = favoriteSoundIds.has(sound.id);
                        const canManage =
                          currentUserRole === "admin" ||
                          sound.createdBy === currentUserId;
                        return (
                          <div className="sound-card" key={sound.id}>
                            <button
                              className={`sound-button ${activeSound === sound.id ? "is-playing" : ""}`}
                              data-asset-status={sound.assetStatus}
                              type="button"
                              disabled={
                                sound.assetStatus === "loading" ||
                                (sound.assetStatus === "ready" &&
                                  soundLimitReached)
                              }
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
                            <div className="sound-card-actions">
                              <button
                                className={`sound-favorite ${favorited ? "is-active" : ""}`}
                                type="button"
                                aria-label={`${favorited ? "Remove" : "Add"} ${sound.label} ${favorited ? "from" : "to"} favorites`}
                                aria-pressed={favorited}
                                onClick={() => void toggleFavorite(sound.id)}
                              >
                                <Star
                                  size={12}
                                  fill={favorited ? "currentColor" : "none"}
                                />
                              </button>
                              {canManage ? (
                                <button
                                  className="sound-edit"
                                  type="button"
                                  aria-label={`Edit ${sound.label}`}
                                  onClick={() => setEditingSound(sound)}
                                >
                                  <Pencil size={12} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
          {normalizedQuery &&
          sections.every((section) => section.sounds.length === 0) ? (
            <p className="soundboard-empty">No sound matches that search.</p>
          ) : null}
        </div>
      )}

      {error || catalogError ? (
        <p className="soundboard-error" role="alert">
          {error ?? catalogError}
        </p>
      ) : null}

      <div className="soundboard-stop-control">
        <button
          type="button"
          disabled={activeLocalSoundCount === 0}
          aria-label={`Stop my sounds (${activeLocalSoundCount}/${maxConcurrentSounds} playing)`}
          title="Stop my sounds"
          onClick={() => void onStopAll()}
        >
          <Square size={14} />
        </button>
        {activeLocalSoundCount > 0 ? (
          <strong aria-live="polite">
            {activeLocalSoundCount}/{maxConcurrentSounds}
          </strong>
        ) : (
          <span className="visually-hidden">No sounds playing</span>
        )}
      </div>

      {editingSound ? (
        <EditSoundModal
          sound={editingSound}
          canDelete={
            currentUserRole === "admin" ||
            editingSound.createdBy === currentUserId
          }
          onDelete={async () => {
            await onDelete(editingSound.id);
            setEditingSound(null);
          }}
          onSave={async (input) => {
            await onUpdate(editingSound.id, input);
            setEditingSound(null);
          }}
          onClose={() => setEditingSound(null)}
        />
      ) : null}

      {uploadOpen ? (
        <UploadSoundModal
          onUpload={async (input) => {
            await onUpload(input);
            setCollapsedSections((current) => {
              const category = categories.find((item) => item.acceptsUploads);
              if (!category) return current;
              const next = { ...current, [category.id]: false };
              saveCollapsedSections(serverId, next);
              return next;
            });
            setUploadOpen(false);
          }}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}
    </section>
  );
}

function EditSoundModal({
  sound,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  sound: SoundboardSound;
  canDelete: boolean;
  onSave: (input: SoundboardMetadataInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(sound.label);
  const [emoji, setEmoji] = useState(sound.emoji);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ label, emoji });
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

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That sound did not delete.",
      );
      setDeleting(false);
    }
  }

  return (
    <Modal
      title="Edit sound"
      description="The uploader and server admins can change its name and emoji."
      onClose={onClose}
      overlayOwner="soundboard"
      size="compact"
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
        <p className="settings-hint">
          Category: {sound.createdBy ? "Bakbak" : "Server managed"}
        </p>
        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          {canDelete ? (
            <button
              className="danger-button"
              type="button"
              disabled={saving || deleting}
              onClick={() => void remove()}
            >
              <Trash2 size={14} />
              {deleting
                ? "Deleting…"
                : confirmDelete
                  ? "Confirm delete"
                  : "Delete sound"}
            </button>
          ) : null}
          <button
            className="secondary-button"
            type="button"
            disabled={saving || deleting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={saving || deleting}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UploadSoundModal({
  onUpload,
  onClose,
}: {
  onUpload: (input: SoundboardUploadInput) => Promise<void>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [startSeconds, setStartSeconds] = useState(0);
  const [clipDuration, setClipDuration] = useState(MAX_SOUNDBOARD_CLIP_SECONDS);
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [stage, setStage] = useState<SoundboardPreparationStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<HTMLMediaElement>(null);

  useEffect(
    () => () => {
      cancelSoundboardPreparation();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!selected) return;
    setError(null);
    try {
      validateSoundboardSource(selected);
      const url = URL.createObjectURL(selected);
      const duration = await readMediaDuration(selected, url);
      if (duration < MIN_SOUNDBOARD_CLIP_SECONDS) {
        URL.revokeObjectURL(url);
        throw new Error("Choose a file with at least 0.1 seconds of audio.");
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(selected);
      setPreviewUrl(url);
      setSourceDuration(duration);
      setStartSeconds(0);
      setClipDuration(Math.min(MAX_SOUNDBOARD_CLIP_SECONDS, duration));
      setLabel(fileLabel(selected.name));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Bakbak could not inspect that file.",
      );
    }
  }

  function updateStart(value: number) {
    const nextStart = Math.min(
      Math.max(0, value),
      Math.max(0, sourceDuration - MIN_SOUNDBOARD_CLIP_SECONDS),
    );
    setStartSeconds(nextStart);
    setClipDuration((current) =>
      Math.min(
        current,
        MAX_SOUNDBOARD_CLIP_SECONDS,
        sourceDuration - nextStart,
      ),
    );
  }

  async function previewSelection() {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = startSeconds;
    try {
      await media.play();
    } catch {
      setError("This device blocked the preview. Uploading can still work.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose an audio or video file first.");
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      validateSoundboardClipWindow(sourceDuration, startSeconds, clipDuration);
      const clip = await prepareSoundboardClip(
        file,
        startSeconds,
        clipDuration,
        setStage,
      );
      setStage("finalizing");
      await onUpload({ label, emoji, clip });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError")
        return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Bakbak could not upload that sound.",
      );
    } finally {
      setPreparing(false);
      setStage(null);
    }
  }

  const maxStart = Math.max(0, sourceDuration - MIN_SOUNDBOARD_CLIP_SECONDS);
  const maxDuration = Math.min(
    MAX_SOUNDBOARD_CLIP_SECONDS,
    Math.max(MIN_SOUNDBOARD_CLIP_SECONDS, sourceDuration - startSeconds),
  );

  return (
    <Modal
      eyebrow="Soundboard"
      title="Upload a sound"
      description="Choose up to five seconds. Video is welcome; Bakbak keeps only its audio."
      onClose={() => {
        cancelSoundboardPreparation();
        onClose();
      }}
      overlayOwner="soundboard"
      size="wide"
    >
      <form
        className="sound-upload-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="sound-upload-picker">
          <Upload size={18} />
          <span>
            <strong>{file?.name ?? "Choose audio or video"}</strong>
            <small>Common audio/video formats · up to 25 MiB</small>
          </span>
          <input
            aria-label="Choose sound file"
            type="file"
            accept="audio/*,video/*"
            disabled={preparing}
            onChange={(event) => void chooseFile(event)}
          />
        </label>

        {previewUrl && file ? (
          <div className="sound-upload-preview">
            {file.type.startsWith("video/") ? (
              <video
                ref={(element) => {
                  mediaRef.current = element;
                }}
                src={previewUrl}
                controls
                preload="metadata"
                onTimeUpdate={(event) => {
                  if (
                    event.currentTarget.currentTime >=
                    startSeconds + clipDuration
                  ) {
                    event.currentTarget.pause();
                  }
                }}
              />
            ) : (
              <audio
                ref={(element) => {
                  mediaRef.current = element;
                }}
                src={previewUrl}
                controls
                preload="metadata"
                onTimeUpdate={(event) => {
                  if (
                    event.currentTarget.currentTime >=
                    startSeconds + clipDuration
                  ) {
                    event.currentTarget.pause();
                  }
                }}
              />
            )}
            <button
              className="secondary-button"
              type="button"
              disabled={preparing}
              onClick={() => void previewSelection()}
            >
              Preview selected clip
            </button>
          </div>
        ) : null}

        {file ? (
          <div className="sound-trim-controls">
            <label>
              <span>
                Start <strong>{formatSeconds(startSeconds)}</strong>
              </span>
              <input
                aria-label="Clip start"
                type="range"
                min="0"
                max={maxStart}
                step="0.05"
                value={startSeconds}
                disabled={preparing}
                onChange={(event) => updateStart(Number(event.target.value))}
              />
            </label>
            <label>
              <span>
                Length <strong>{formatSeconds(clipDuration)}</strong>
              </span>
              <input
                aria-label="Clip length"
                type="range"
                min={MIN_SOUNDBOARD_CLIP_SECONDS}
                max={maxDuration}
                step="0.05"
                value={Math.min(clipDuration, maxDuration)}
                disabled={preparing}
                onChange={(event) =>
                  setClipDuration(Number(event.target.value))
                }
              />
            </label>
          </div>
        ) : null}

        <div className="sound-upload-fields">
          <label>
            <span>Name</span>
            <input
              value={label}
              maxLength={50}
              required
              disabled={preparing}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label>
            <span>Emoji (optional)</span>
            <input
              value={emoji}
              maxLength={16}
              placeholder="🔊"
              disabled={preparing}
              onChange={(event) => setEmoji(event.target.value)}
            />
          </label>
        </div>
        <p className="settings-hint">
          Publishes to Bakbak. Only you and server admins can edit or delete it.
        </p>
        {stage ? (
          <p className="sound-upload-progress" role="status">
            <LoaderCircle size={14} />
            {stage === "loading-engine"
              ? "Loading the local audio engine…"
              : stage === "extracting-audio"
                ? "Cutting the clip on this device…"
                : "Publishing to Bakbak…"}
          </p>
        ) : null}
        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              cancelSoundboardPreparation();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!file || preparing}
          >
            {preparing ? "Preparing…" : "Upload sound"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function loadCollapsedSections(
  serverId: string,
  categories: SoundboardCategory[],
): Record<string, boolean> {
  const defaults: Record<string, boolean> = { [FAVORITES_SECTION_ID]: false };
  categories.forEach((category) => {
    defaults[category.id] = category.name.toLocaleLowerCase() === "system";
  });
  try {
    const raw = localStorage.getItem(collapseStorageKey(serverId));
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaults;
    }
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === "boolean" && key in defaults) defaults[key] = value;
    });
  } catch {
    return defaults;
  }
  return defaults;
}

function saveCollapsedSections(
  serverId: string,
  collapsed: Record<string, boolean>,
): void {
  try {
    localStorage.setItem(
      collapseStorageKey(serverId),
      JSON.stringify(collapsed),
    );
  } catch {
    // Collapse state is a convenience; the soundboard remains usable without it.
  }
}

function collapseStorageKey(serverId: string): string {
  return `bakbak.soundboardSections.v1:${serverId}`;
}

function readMediaDuration(file: File, url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio",
    );
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = media.duration;
      media.removeAttribute("src");
      media.load();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Bakbak could not read that file's duration."));
        return;
      }
      resolve(duration);
    };
    media.onerror = () => {
      media.removeAttribute("src");
      reject(new Error("Bakbak could not decode that audio or video file."));
    };
    media.src = url;
  });
}

function fileLabel(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .trim()
      .slice(0, 50) || "New sound"
  );
}

function formatSeconds(value: number): string {
  return `${value.toFixed(value < 1 ? 2 : 1)}s`;
}
