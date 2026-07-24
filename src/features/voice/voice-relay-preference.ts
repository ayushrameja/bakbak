const STORAGE_PREFIX = "bakbak.voiceRelayPreference.";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(serverUrl: string): string {
  try {
    return `${STORAGE_PREFIX}${new URL(serverUrl).host}`;
  } catch {
    return `${STORAGE_PREFIX}${serverUrl}`;
  }
}

export function loadRelayPreference(
  serverUrl: string,
  now = Date.now(),
  storage: StorageLike | null = browserStorage(),
): number {
  if (!storage || !serverUrl) return 0;
  const value = Number(storage.getItem(storageKey(serverUrl)));
  if (!Number.isFinite(value) || value <= now) {
    storage.removeItem(storageKey(serverUrl));
    return 0;
  }
  return value;
}

export function saveRelayPreference(
  serverUrl: string,
  preferredUntil: number,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage || !serverUrl) return;
  storage.setItem(storageKey(serverUrl), String(preferredUntil));
}

export function clearRelayPreference(
  serverUrl: string,
  storage: StorageLike | null = browserStorage(),
): void {
  storage?.removeItem(storageKey(serverUrl));
}
