const DATABASE_NAME = "bakbak-soundboard";
const STORE_NAME = "sounds";

export function soundCacheKey(soundId: string, audioRevision: number): string {
  return `${soundId}:${audioRevision}`;
}

export class SoundBlobCache {
  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  async get(key: string): Promise<Blob | null> {
    const database = await this.open();
    if (!database) return null;
    return await new Promise((resolve) => {
      const request = database
        .transaction(STORE_NAME)
        .objectStore(STORE_NAME)
        .get(key);
      request.onsuccess = () =>
        resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  }

  async put(key: string, blob: Blob): Promise<void> {
    const database = await this.open();
    if (!database) return;
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(blob, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  async prune(activeKeys: ReadonlySet<string>): Promise<void> {
    const database = await this.open();
    if (!database) return;
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === "string" && !activeKeys.has(cursor.key)) {
          store.delete(cursor.key);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  private async open(): Promise<IDBDatabase | null> {
    if (!this.factory) return null;
    return await new Promise((resolve) => {
      const request = this.factory?.open(DATABASE_NAME, 1);
      if (!request) return resolve(null);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
}
