export interface SelectableScreenShare {
  id: string;
  joinedAt: string | null;
}

export function chooseFeaturedScreenShare(
  currentId: string | null,
  shares: readonly SelectableScreenShare[],
): string | null {
  if (currentId === null || shares.length === 0) return null;
  if (shares.some((share) => share.id === currentId)) return currentId;
  return null;
}
