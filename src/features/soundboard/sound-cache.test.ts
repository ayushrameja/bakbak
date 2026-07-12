import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { SoundBlobCache, soundCacheKey } from "./sound-cache";

describe("SoundBlobCache", () => {
  it("stores blobs by audio revision and prunes stale revisions", async () => {
    const cache = new SoundBlobCache(new IDBFactory());
    const firstKey = soundCacheKey("sound-1", 1);
    const secondKey = soundCacheKey("sound-1", 2);
    const first = new Blob(["first"], { type: "audio/mpeg" });
    const second = new Blob(["second"], { type: "audio/mpeg" });

    await cache.put(firstKey, first);
    await cache.put(secondKey, second);
    expect(await cache.get(firstKey)).not.toBeNull();
    expect(await cache.get(secondKey)).not.toBeNull();

    await cache.prune(new Set([secondKey]));
    expect(await cache.get(firstKey)).toBeNull();
    expect(await cache.get(secondKey)).not.toBeNull();
  });

  it("degrades to a no-op when IndexedDB is unavailable", async () => {
    const cache = new SoundBlobCache(undefined);
    await expect(cache.get("missing")).resolves.toBeNull();
    await expect(cache.put("missing", new Blob())).resolves.toBeUndefined();
    await expect(cache.prune(new Set())).resolves.toBeUndefined();
  });
});
