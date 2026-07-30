import { useEffect, useMemo, useRef, useState } from "react";
import type { GiphyAsset } from "../../lib/giphy-service";
import {
  downloadMessageMedia,
  downloadMessagePoster,
  messageMediaDiagnostic,
  MessageMediaRetrievalError,
} from "../../lib/message-media-service";
import type {
  ConversationMessage,
  MessageAttachment,
  Sticker,
} from "../../lib/types";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { optimisticMessageMedia } from "./optimistic-message-media";

export function RichMessageMedia({
  message,
  stickersById,
  giphy = null,
}: {
  message: ConversationMessage;
  stickersById: ReadonlyMap<string, Sticker>;
  giphy?: GiphyAsset | null;
}) {
  const reducedMotion = useReducedMotion();
  const presentation = message.presentation;

  if (presentation?.kind === "sticker") {
    const sticker = stickersById.get(presentation.stickerId);
    return sticker ? (
      <img
        className="message-sticker"
        src={
          reducedMotion
            ? (sticker.posterUrl ?? undefined)
            : (sticker.animationUrl ?? sticker.posterUrl ?? undefined)
        }
        alt={sticker.label}
      />
    ) : (
      <span className="message-media-placeholder">Sticker unavailable</span>
    );
  }
  if (presentation?.kind === "giphy") {
    if (!giphy) {
      return (
        <span className="message-media-placeholder">
          {presentation.title || "GIPHY media"} unavailable
        </span>
      );
    }
    return giphy.originalUrl.includes(".mp4") && !reducedMotion ? (
      <video
        className="message-giphy"
        src={giphy.originalUrl}
        poster={giphy.stillUrl}
        muted
        autoPlay
        loop
        playsInline
        aria-label={giphy.altText}
      />
    ) : (
      <img
        className="message-giphy"
        src={reducedMotion ? giphy.stillUrl : giphy.originalUrl}
        alt={giphy.altText}
        loading="lazy"
      />
    );
  }
  if (!message.attachments?.length) return null;
  return (
    <div className="message-attachments">
      {message.attachments.map((attachment) => (
        <AttachmentView attachment={attachment} key={attachment.id} />
      ))}
    </div>
  );
}

function AttachmentView({ attachment }: { attachment: MessageAttachment }) {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const automaticPosterRefreshUsed = useRef(false);
  const [poster, setPoster] = useState<MediaUrl | null>(() =>
    attachment.posterUrl ? { url: attachment.posterUrl, owned: false } : null,
  );
  const [object, setObject] = useState<MediaUrl | null>(() =>
    attachment.objectUrl ? { url: attachment.objectUrl, owned: false } : null,
  );
  const [posterRequest, setPosterRequest] = useState({
    version: 0,
    refresh: false,
  });
  const [objectRequest, setObjectRequest] = useState(0);
  const [posterLoading, setPosterLoading] = useState(
    Boolean(attachment.posterPath),
  );
  const [posterFailure, setPosterFailure] = useState<MediaDiagnostic | null>(
    null,
  );
  const [objectFailure, setObjectFailure] = useState<MediaDiagnostic | null>(
    null,
  );
  const [optimisticReleased, setOptimisticReleased] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const needsObject =
    attachment.kind === "video" ||
    (attachment.kind === "gif" && !reducedMotion) ||
    expanded;
  const optimisticUrl = optimisticReleased
    ? null
    : attachment.optimisticPreviewKey
      ? optimisticMessageMedia.activeUrl(attachment.optimisticPreviewKey)
      : (attachment.optimisticPreviewUrl ?? null);

  useEffect(() => {
    if (!attachment.posterPath) {
      setPoster(
        attachment.posterUrl
          ? { url: attachment.posterUrl, owned: false }
          : null,
      );
      setPosterLoading(false);
      return;
    }
    let cancelled = false;
    let unownedUrl: string | null = null;
    setPosterLoading(true);
    setPosterFailure(null);
    void downloadMessagePoster(attachment.posterPath, {
      refresh: posterRequest.refresh,
    })
      .then((blob) => {
        unownedUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(unownedUrl);
          unownedUrl = null;
          return;
        }
        setPoster({ url: unownedUrl, owned: true });
        unownedUrl = null;
        setPosterLoading(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPosterLoading(false);
          setPosterFailure(messageMediaDiagnostic(error));
        }
      });
    return () => {
      cancelled = true;
      if (unownedUrl) URL.revokeObjectURL(unownedUrl);
    };
  }, [
    attachment.posterPath,
    attachment.posterUrl,
    posterRequest.refresh,
    posterRequest.version,
  ]);

  useEffect(() => {
    if (!attachment.objectPath) {
      setObject(
        attachment.objectUrl
          ? { url: attachment.objectUrl, owned: false }
          : null,
      );
      return;
    }
    if (!needsObject) return;
    let cancelled = false;
    let unownedUrl: string | null = null;
    setObjectFailure(null);
    void downloadMessageMedia(attachment.objectPath)
      .then((blob) => {
        unownedUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(unownedUrl);
          unownedUrl = null;
          return;
        }
        setObject({ url: unownedUrl, owned: true });
        unownedUrl = null;
      })
      .catch((error: unknown) => {
        if (!cancelled) setObjectFailure(messageMediaDiagnostic(error));
      });
    return () => {
      cancelled = true;
      if (unownedUrl) URL.revokeObjectURL(unownedUrl);
    };
  }, [attachment.objectPath, attachment.objectUrl, needsObject, objectRequest]);

  useEffect(
    () => () => {
      if (poster?.owned) URL.revokeObjectURL(poster.url);
    },
    [poster],
  );

  useEffect(
    () => () => {
      if (object?.owned) URL.revokeObjectURL(object.url);
    },
    [object],
  );

  const aspectRatio = useMemo(
    () => `${attachment.width} / ${attachment.height}`,
    [attachment.height, attachment.width],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [attachment.kind]);

  const retryPoster = () => {
    automaticPosterRefreshUsed.current = true;
    setPosterFailure(null);
    setPosterLoading(true);
    setPosterRequest((current) => ({
      version: current.version + 1,
      refresh: true,
    }));
  };

  const handlePosterError = () => {
    if (poster?.owned) setPoster(null);
    if (!automaticPosterRefreshUsed.current && attachment.posterPath) {
      automaticPosterRefreshUsed.current = true;
      setPosterLoading(true);
      setPosterRequest((current) => ({
        version: current.version + 1,
        refresh: true,
      }));
      return;
    }
    setPosterFailure(
      messageMediaDiagnostic(
        new MessageMediaRetrievalError(
          "decode",
          "message-poster:element-decode-failed",
        ),
      ),
    );
  };

  const handlePersistedPosterLoad = () => {
    if (!poster?.owned || !attachment.optimisticPreviewKey) return;
    optimisticMessageMedia.release(attachment.optimisticPreviewKey);
    setOptimisticReleased(true);
  };

  const displayPosterUrl = poster?.url ?? optimisticUrl;
  const displayObjectUrl = object?.url;
  const imageUrl =
    attachment.kind === "gif" && !reducedMotion
      ? (displayObjectUrl ?? displayPosterUrl)
      : displayPosterUrl;

  if (attachment.kind === "video") {
    return (
      <div className="message-video">
        <video
          ref={videoRef}
          controls
          preload="metadata"
          src={displayObjectUrl ?? undefined}
          poster={displayPosterUrl ?? undefined}
          style={{ aspectRatio }}
          onError={() =>
            setObjectFailure(
              messageMediaDiagnostic(
                new MessageMediaRetrievalError(
                  "decode",
                  "message-object:video-decode-failed",
                ),
              ),
            )
          }
        />
        {objectFailure ? (
          <MediaError
            diagnostic={objectFailure}
            label="Video"
            onRetry={() => setObjectRequest((current) => current + 1)}
          />
        ) : null}
        {posterFailure ? (
          <MediaError
            diagnostic={posterFailure}
            label="Video poster"
            onRetry={retryPoster}
          />
        ) : null}
      </div>
    );
  }
  if (!imageUrl && posterFailure) {
    return (
      <MediaError
        diagnostic={posterFailure}
        label={attachment.kind === "gif" ? "GIF" : "Image"}
        onRetry={retryPoster}
      />
    );
  }
  if (!imageUrl && posterLoading) {
    return (
      <span className="message-media-placeholder" role="status">
        Loading {attachment.kind === "gif" ? "GIF" : "image"}…
      </span>
    );
  }
  return (
    <>
      {imageUrl ? (
        <button
          className="message-attachment-image"
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Open image"
        >
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            style={{ aspectRatio }}
            onLoad={
              imageUrl === poster?.url ? handlePersistedPosterLoad : undefined
            }
            onError={
              imageUrl === object?.url
                ? () =>
                    setObjectFailure(
                      messageMediaDiagnostic(
                        new MessageMediaRetrievalError(
                          "decode",
                          "message-object:image-decode-failed",
                        ),
                      ),
                    )
                : handlePosterError
            }
          />
        </button>
      ) : null}
      {posterFailure ? (
        <MediaError
          diagnostic={posterFailure}
          label={attachment.kind === "gif" ? "GIF" : "Image"}
          onRetry={retryPoster}
        />
      ) : null}
      {objectFailure ? (
        <MediaError
          diagnostic={objectFailure}
          label="Original image"
          onRetry={() => setObjectRequest((current) => current + 1)}
        />
      ) : null}
      {expanded ? (
        <div
          className="message-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded image"
          onClick={() => setExpanded(false)}
        >
          <button type="button" onClick={() => setExpanded(false)}>
            Close
          </button>
          <img src={displayObjectUrl ?? displayPosterUrl ?? undefined} alt="" />
        </div>
      ) : null}
    </>
  );
}

interface MediaUrl {
  url: string;
  owned: boolean;
}

interface MediaDiagnostic {
  message: string;
  diagnostic: string;
}

function MediaError({
  diagnostic,
  label,
  onRetry,
}: {
  diagnostic: MediaDiagnostic;
  label: string;
  onRetry: () => void;
}) {
  return (
    <span className="message-media-error" role="status">
      <span>
        {label} unavailable. {diagnostic.message}
      </span>
      <small>{diagnostic.diagnostic}</small>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </span>
  );
}
