import { useEffect, useRef, useState } from "react";
import {
  GiphyRateLimitError,
  isGiphyConfigured,
  registerGiphyAction,
  searchGiphy,
  type GiphyAsset,
} from "../../lib/giphy-service";
import type { GiphyAssetKind } from "../../lib/types";

export function GiphyPicker({
  onSelect,
  onClose,
}: {
  onSelect: (asset: GiphyAsset) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<GiphyAssetKind>("gif");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<GiphyAsset[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestRevision = useRef(0);
  const loadedAnalytics = useRef(new Set<string>());

  function registerLoadOnce(asset: GiphyAsset) {
    if (loadedAnalytics.current.has(asset.id)) return;
    loadedAnalytics.current.add(asset.id);
    registerGiphyAction(asset, "onload");
  }

  useEffect(() => {
    if (!isGiphyConfigured()) return;
    const revision = ++requestRevision.current;
    const timer = window.setTimeout(
      () => {
        if (query.trim().length === 1) {
          setAssets([]);
          setNextOffset(null);
          return;
        }
        setLoading(true);
        setError(null);
        void searchGiphy(kind, query)
          .then((result) => {
            if (revision !== requestRevision.current) return;
            setAssets(result.assets);
            setNextOffset(result.nextOffset);
          })
          .catch((caught) => {
            if (revision !== requestRevision.current) return;
            setError(
              caught instanceof GiphyRateLimitError
                ? caught.message
                : "GIFs could not be loaded.",
            );
          })
          .finally(() => {
            if (revision === requestRevision.current) setLoading(false);
          });
      },
      query ? 500 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [kind, query, retryRevision]);

  return (
    <div
      className="media-picker media-picker--giphy"
      role="dialog"
      aria-label="GIPHY picker"
    >
      <header>
        <div className="media-picker__tabs" role="tablist">
          {(["gif", "sticker"] as const).map((nextKind) => (
            <button
              type="button"
              role="tab"
              aria-selected={kind === nextKind}
              className={kind === nextKind ? "is-active" : ""}
              onClick={() => setKind(nextKind)}
              key={nextKind}
            >
              {nextKind === "gif" ? "GIFs" : "Stickers"}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="Close GIPHY picker">
          ×
        </button>
      </header>
      {isGiphyConfigured() ? (
        <>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search GIPHY ${kind === "gif" ? "GIFs" : "stickers"}`}
            aria-label={`Search GIPHY ${kind === "gif" ? "GIFs" : "stickers"}`}
            maxLength={50}
          />
          {error ? (
            <div className="media-picker__error" role="alert">
              <p className="media-picker__status">{error}</p>
              <button
                type="button"
                onClick={() => setRetryRevision((current) => current + 1)}
              >
                Retry
              </button>
            </div>
          ) : null}
          <div className="giphy-grid" aria-busy={loading}>
            {assets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                aria-label={`Add ${asset.altText} to message`}
                onMouseEnter={() => registerLoadOnce(asset)}
                onFocus={() => registerLoadOnce(asset)}
                onClick={() => {
                  registerGiphyAction(asset, "onclick");
                  onSelect(asset);
                }}
              >
                {asset.previewUrl.includes(".mp4") ? (
                  <video
                    src={asset.previewUrl}
                    poster={asset.stillUrl}
                    muted
                    autoPlay
                    loop
                    playsInline
                  />
                ) : (
                  <img src={asset.previewUrl} alt="" loading="lazy" />
                )}
              </button>
            ))}
          </div>
          {nextOffset !== null ? (
            <button
              className="secondary-button media-picker__more"
              type="button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void searchGiphy(kind, query, nextOffset)
                  .then((result) => {
                    setAssets((current) => [...current, ...result.assets]);
                    setNextOffset(result.nextOffset);
                  })
                  .catch(() => setError("More GIFs could not be loaded."))
                  .finally(() => setLoading(false));
              }}
            >
              Load more
            </button>
          ) : null}
          <strong className="giphy-attribution">Powered by GIPHY</strong>
        </>
      ) : (
        <p className="media-picker__status">
          Add the public GIPHY key to enable GIF and sticker search.
        </p>
      )}
    </div>
  );
}
