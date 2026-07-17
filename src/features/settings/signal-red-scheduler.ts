export const SIGNAL_SAFE_STAMP_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export type SignalStampPosition = (typeof SIGNAL_SAFE_STAMP_POSITIONS)[number];

export function nextSignalAmbientDelay(random: () => number): number {
  return 18_000 + Math.floor(random() * 14_001);
}

export function nextSignalStampDuration(random: () => number): number {
  return 450 + Math.floor(random() * 301);
}
