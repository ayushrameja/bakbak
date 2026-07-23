import { useEffect, useMemo, useRef, useState } from "react";
import type { GiphyAsset } from "../../lib/giphy-service";
import { downloadMessageMedia } from "../../lib/message-media-service";
import type {
  ConversationMessage,
  MessageAttachment,
  Sticker,
} from "../../lib/types";
import { useReducedMotion } from "../../lib/use-reduced-motion";

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
  const [posterUrl, setPosterUrl] = useState<string | null>(
    attachment.posterUrl ?? null,
  );
  const [objectUrl, setObjectUrl] = useState<string | null>(
    attachment.objectUrl ?? null,
  );
  const [posterUnavailable, setPosterUnavailable] = useState(false);
  const [objectUnavailable, setObjectUnavailable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const needsObject =
    attachment.kind === "video" ||
    (attachment.kind === "gif" && !reducedMotion) ||
    expanded;

  useEffect(() => {
    if (attachment.posterUrl || !attachment.posterPath) {
      setPosterUrl(attachment.posterUrl ?? null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    void downloadMessageMedia(attachment.posterPath, true)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPosterUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPosterUnavailable(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.posterPath, attachment.posterUrl]);

  useEffect(() => {
    if (attachment.objectUrl || !attachment.objectPath) {
      setObjectUrl(attachment.objectUrl ?? null);
      return;
    }
    if (!needsObject) return;
    let cancelled = false;
    let url: string | null = null;
    void downloadMessageMedia(attachment.objectPath)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setObjectUnavailable(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.objectPath, attachment.objectUrl, needsObject]);

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

  if (attachment.kind === "video") {
    return (
      <div className="message-video">
        <video
          ref={videoRef}
          controls
          preload="metadata"
          src={objectUrl ?? undefined}
          poster={posterUrl ?? undefined}
          style={{ aspectRatio }}
        />
        {objectUnavailable ? (
          <span className="message-media-placeholder">
            Video unavailable offline
          </span>
        ) : null}
      </div>
    );
  }
  if (posterUnavailable && !objectUrl) {
    return (
      <span className="message-media-placeholder">
        {attachment.kind === "gif" ? "GIF" : "Image"} unavailable offline
      </span>
    );
  }
  return (
    <>
      <button
        className="message-attachment-image"
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Open image"
      >
        <img
          src={
            attachment.kind === "gif" && !reducedMotion
              ? (objectUrl ?? posterUrl ?? undefined)
              : (posterUrl ?? undefined)
          }
          alt=""
          loading="lazy"
          style={{ aspectRatio }}
        />
      </button>
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
          <img src={objectUrl ?? posterUrl ?? undefined} alt="" />
        </div>
      ) : null}
    </>
  );
}
