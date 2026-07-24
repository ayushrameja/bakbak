export const CHANNEL_GROUP_PREFERENCES_PREFIX = "bakbak.channelCategories.v1";

export type CollapsedChannelGroups = Record<string, boolean>;

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

export function channelGroupPreferencesKey(serverId: string): string {
  return `${CHANNEL_GROUP_PREFERENCES_PREFIX}:${serverId}`;
}

export function loadCollapsedChannelGroups(
  serverId: string,
  groupIds: readonly string[],
  storage: StorageLike | undefined = browserStorage(),
): CollapsedChannelGroups {
  const defaults = Object.fromEntries(
    groupIds.map((groupId) => [groupId, false]),
  );
  if (!storage) return defaults;

  try {
    const stored: unknown = JSON.parse(
      storage.getItem(channelGroupPreferencesKey(serverId)) ?? "null",
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return defaults;
    }

    groupIds.forEach((groupId) => {
      const value = (stored as Record<string, unknown>)[groupId];
      if (typeof value === "boolean") defaults[groupId] = value;
    });
  } catch {
    // A malformed convenience preference must never block the channel list.
  }

  return defaults;
}

export function saveCollapsedChannelGroups(
  serverId: string,
  collapsedGroups: CollapsedChannelGroups,
  storage: StorageLike | undefined = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      channelGroupPreferencesKey(serverId),
      JSON.stringify(collapsedGroups),
    );
  } catch {
    // The disclosure still works for this session if storage is unavailable.
  }
}
