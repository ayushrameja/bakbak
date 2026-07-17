import {
  AVATAR_BUCKET,
  COVER_BUCKET,
  downloadProfileMediaObjectUrl,
} from "./profile-service";

type ProfileMediaBucket = typeof AVATAR_BUCKET | typeof COVER_BUCKET;

export class ProfileMediaCache {
  private readonly urls = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly epochs = new Map<string, number>();

  load(
    bucket: ProfileMediaBucket,
    path: string | null,
  ): Promise<string | null> {
    if (!path) return Promise.resolve(null);
    const key = `${bucket}:${path}`;
    const cached = this.urls.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const epoch = this.epochs.get(key) ?? 0;
    const request = downloadProfileMediaObjectUrl(bucket, path)
      .then((url) => {
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
    this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1);
    const url = this.urls.get(key);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(key);
    this.pending.delete(key);
  }

  clear(): void {
    [...this.pending.keys(), ...this.urls.keys()].forEach((key) =>
      this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1),
    );
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
    this.pending.clear();
  }
}
