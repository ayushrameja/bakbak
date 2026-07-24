import { useMemo, useRef, useState } from "react";
import type { Sticker } from "../../lib/types";

export function StickerPicker({
  stickers,
  currentUserId,
  currentUserIsAdmin,
  reactionMode = false,
  onSelect,
  onUpload,
  onArchive,
  onClose,
}: {
  stickers: Sticker[];
  currentUserId: string;
  currentUserIsAdmin: boolean;
  reactionMode?: boolean;
  onSelect: (sticker: Sticker) => void;
  onUpload?: (file: File, label: string) => Promise<void>;
  onArchive?: (stickerId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return stickers.filter(
      (sticker) =>
        sticker.enabled &&
        (!normalized || sticker.label.toLocaleLowerCase().includes(normalized)),
    );
  }, [query, stickers]);

  return (
    <div
      className="media-picker sticker-picker"
      role="dialog"
      aria-label="Bakbak stickers"
    >
      <header>
        <strong>
          {reactionMode ? "React with a sticker" : "Bakbak stickers"}
        </strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sticker picker"
        >
          ×
        </button>
      </header>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search stickers"
        aria-label="Search Bakbak stickers"
      />
      <div className="sticker-grid">
        {visible.map((sticker) => (
          <div className="sticker-grid__item" key={sticker.id}>
            <button
              type="button"
              aria-label={`${reactionMode ? "React with" : "Send"} ${sticker.label}`}
              onClick={() => onSelect(sticker)}
            >
              <img
                src={sticker.animationUrl ?? sticker.posterUrl ?? undefined}
                alt={sticker.label}
                loading="lazy"
              />
            </button>
            {!reactionMode &&
            onArchive &&
            (currentUserIsAdmin || sticker.createdBy === currentUserId) ? (
              <button
                type="button"
                className="sticker-grid__remove"
                aria-label={`Remove ${sticker.label}`}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onArchive(sticker.id).finally(() => setBusy(false));
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {!visible.length ? (
        <p className="media-picker__status">No matching stickers yet.</p>
      ) : null}
      {!reactionMode && onUpload ? (
        <>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept="image/png,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const label =
                file.name
                  .replace(/\.[^.]+$/, "")
                  .trim()
                  .slice(0, 50) || "Sticker";
              setBusy(true);
              void onUpload(file, label).finally(() => setBusy(false));
            }}
          />
          <button
            type="button"
            className="secondary-button media-picker__upload"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Preparing…" : "Upload sticker"}
          </button>
        </>
      ) : null}
    </div>
  );
}
