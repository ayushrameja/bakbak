import { useEffect, useRef } from "react";
import type { VideoTrackLike } from "./useVoiceRoom";

export function ParticipantVideo({
  track,
  local,
  label,
}: {
  track: VideoTrackLike;
  local: boolean;
  label: string;
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
        local
          ? "participant-video participant-video--local"
          : "participant-video"
      }
      aria-label={`${label} camera`}
      autoPlay
      playsInline
      muted={local}
    />
  );
}
