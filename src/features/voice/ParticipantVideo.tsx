import { useEffect, useRef } from "react";
import type { VideoTrackLike } from "./useVoiceRoom";

export function ParticipantVideo({
  track,
  local,
  label,
  kind = "camera",
}: {
  track: VideoTrackLike;
  local: boolean;
  label: string;
  kind?: "camera" | "screen";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return (
    <video
      ref={videoRef}
      className={
        local && kind === "camera"
          ? "participant-video participant-video--local"
          : "participant-video"
      }
      aria-label={`${label} ${kind}`}
      autoPlay
      playsInline
      muted={local}
    />
  );
}
