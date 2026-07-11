export function formatVoiceElapsedTime(
  joinedAt: string,
  now = Date.now(),
): string {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - Date.parse(joinedAt)) / 1000),
  );
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
