import { useEffect, useState } from "react";
import { formatVoiceElapsedTime } from "./voice-duration";

export function VoiceElapsedTime({ joinedAt }: { joinedAt: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <time dateTime={joinedAt}>{formatVoiceElapsedTime(joinedAt, now)}</time>
  );
}
