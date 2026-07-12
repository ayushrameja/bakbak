export interface SelectableScreenShare {
  id: string;
  joinedAt: string | null;
}

export function chooseFeaturedScreenShare(
  currentId: string | null,
  shares: readonly SelectableScreenShare[],
): string | null {
  if (shares.length === 0) return null;
  if (shares.some((share) => share.id === currentId)) return currentId;

  const sorted = [...shares].sort(
    (left, right) => timestamp(left.joinedAt) - timestamp(right.joinedAt),
  );
  return currentId === null ? sorted[0]!.id : sorted.at(-1)!.id;
}

function timestamp(value: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
