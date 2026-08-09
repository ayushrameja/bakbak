export const ACTIVITY_PREVIEW_PREFERENCE_PREFIX =
  "bakbak.activityPreviewCollapsed.v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function activityPreviewPreferenceKey(
  userId: string,
  serverId: string,
): string {
  return `${ACTIVITY_PREVIEW_PREFERENCE_PREFIX}:${userId}:${serverId}`;
}

export function loadActivityPreviewCollapsed(
  userId: string,
  serverId: string,
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    return (
      storage.getItem(activityPreviewPreferenceKey(userId, serverId)) === "true"
    );
  } catch {
    return false;
  }
}

export function saveActivityPreviewCollapsed(
  userId: string,
  serverId: string,
  collapsed: boolean,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      activityPreviewPreferenceKey(userId, serverId),
      String(collapsed),
    );
  } catch {
    // The disclosure still works for this session if storage is unavailable.
  }
}
