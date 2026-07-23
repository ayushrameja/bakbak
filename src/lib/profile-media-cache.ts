import {
  AVATAR_BUCKET,
  COVER_BUCKET,
  downloadProfileMediaBlob,
} from "./profile-service";
import { BakbakCache } from "./local-cache";

type ProfileMediaBucket = typeof AVATAR_BUCKET | typeof COVER_BUCKET;

export interface ProfileMediaLoadOptions {
  refresh?: boolean;
}

export class ProfileMediaCache {
  private readonly urls = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly refreshing = new Map<string, Promise<string | null>>();
  private readonly epochs = new Map<string, number>();
  private userId: string | null = null;

  constructor(private readonly persistentCache: BakbakCache | null = null) {}

  setAccount(userId: string | null): void {
    if (this.userId === userId) return;
    this.clear();
    this.userId = userId;
  }

  load(
    bucket: ProfileMediaBucket,
    path: string | null,
    options: ProfileMediaLoadOptions = {},
  ): Promise<string | null> {
    if (!path) return Promise.resolve(null);
    const key = `${bucket}:${path}`;
    const refreshing = this.refreshing.get(key);
    if (refreshing) return refreshing;
    if (options.refresh) return this.refresh(bucket, path, key);
    const cached = this.urls.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const epoch = this.epochs.get(key) ?? 0;
    const request = this.loadBlob(bucket, path)
      .then((blob) => {
        const url =
          blob && typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(blob)
            : null;
        if ((this.epochs.get(key) ?? 0) !== epoch) {
          if (url) URL.revokeObjectURL(url);
          return null;
        }
        if (url) this.urls.set(key, url);
        return url;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }

  evict(bucket: ProfileMediaBucket, path: string | null): void {
    if (!path) return;
    const key = `${bucket}:${path}`;
    this.invalidateMemory(key);
    if (this.userId && this.persistentCache) {
      void this.persistentCache.evictProfileMedia(this.userId, bucket, path);
    }
  }

  clear(): void {
    [
      ...this.pending.keys(),
      ...this.refreshing.keys(),
      ...this.urls.keys(),
    ].forEach((key) => this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1));
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
    this.pending.clear();
    this.refreshing.clear();
  }

  private refresh(
    bucket: ProfileMediaBucket,
    path: string,
    key: string,
  ): Promise<string | null> {
    this.invalidateMemory(key);
    const epoch = this.epochs.get(key) ?? 0;
    const userId = this.userId;
    const request = (async () => {
      if (userId && this.persistentCache) {
        await this.persistentCache.evictProfileMedia(userId, bucket, path);
      }
      const blob = await downloadProfileMediaBlob(bucket, path);
      const url =
        typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(blob)
          : null;
      if ((this.epochs.get(key) ?? 0) !== epoch) {
        if (url) URL.revokeObjectURL(url);
        return null;
      }
      if (url) this.urls.set(key, url);
      if (userId && this.persistentCache) {
        void this.persistentCache.writeProfileMedia(userId, bucket, path, blob);
      }
      return url;
    })().finally(() => {
      if (this.refreshing.get(key) === request) this.refreshing.delete(key);
    });
    this.refreshing.set(key, request);
    return request;
  }

  private invalidateMemory(key: string): void {
    this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1);
    const url = this.urls.get(key);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(key);
    this.pending.delete(key);
  }

  private async loadBlob(
    bucket: ProfileMediaBucket,
    path: string,
  ): Promise<Blob> {
    const userId = this.userId;
    if (userId && this.persistentCache) {
      const cached = await this.persistentCache.readProfileMedia(
        userId,
        bucket,
        path,
      );
      if (cached) return cached;
    }
    const blob = await downloadProfileMediaBlob(bucket, path);
    if (userId && this.persistentCache) {
      void this.persistentCache.writeProfileMedia(userId, bucket, path, blob);
    }
    return blob;
  }
}
