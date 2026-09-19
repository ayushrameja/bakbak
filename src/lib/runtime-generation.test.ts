import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DesktopRuntimeResetError,
  prepareDesktopRuntimeGeneration,
  runtimeGenerationTestIds,
} from "./runtime-generation";

describe("prepareDesktopRuntimeGeneration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("leaves browser and Electron state untouched", async () => {
    window.localStorage.setItem("bakbak-auth", "session");

    await expect(
      prepareDesktopRuntimeGeneration(
        { shell: "electron", generation: 1 },
        {
          localStorage: window.localStorage,
          sessionStorage: window.sessionStorage,
        },
      ),
    ).resolves.toBe(false);

    expect(window.localStorage.getItem("bakbak-auth")).toBe("session");
  });

  it("clears old WebView state once before marking Tauri generation 2", async () => {
    const factory = new IDBFactory();
    const deleteCache = vi.fn().mockResolvedValue(true);
    const cacheStorage = {
      keys: vi.fn().mockResolvedValue(["old-assets", "old-media"]),
      delete: deleteCache,
    } as unknown as CacheStorage;
    window.localStorage.setItem("bakbak-auth", "old-session");
    window.sessionStorage.setItem("draft", "old-draft");
    await openDatabase(factory, "old-tauri-cache");

    await expect(
      prepareDesktopRuntimeGeneration(
        { shell: "tauri", generation: 2 },
        {
          localStorage: window.localStorage,
          sessionStorage: window.sessionStorage,
          indexedDB: factory,
          cacheStorage,
        },
      ),
    ).resolves.toBe(true);

    expect(window.localStorage.getItem("bakbak-auth")).toBeNull();
    expect(window.sessionStorage.getItem("draft")).toBeNull();
    expect(window.localStorage.getItem(runtimeGenerationTestIds.marker)).toBe(
      runtimeGenerationTestIds.tauriGeneration,
    );
    expect(await factory.databases()).toEqual([]);
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith("old-assets");
    expect(deleteCache).toHaveBeenCalledWith("old-media");

    window.localStorage.setItem("after-migration", "keep-me");
    await expect(
      prepareDesktopRuntimeGeneration(
        { shell: "tauri", generation: 2 },
        { localStorage: window.localStorage, indexedDB: factory },
      ),
    ).resolves.toBe(false);
    expect(window.localStorage.getItem("after-migration")).toBe("keep-me");
  });

  it.each(["blocked", "error"] as const)(
    "does not mark the reset complete when IndexedDB deletion is %s",
    async (failure) => {
      await expect(
        prepareDesktopRuntimeGeneration(
          { shell: "tauri", generation: 2 },
          {
            localStorage: window.localStorage,
            indexedDB: deleteFailureFactory(failure),
            blockedDeleteTimeoutMs: 0,
          },
        ),
      ).rejects.toBeInstanceOf(DesktopRuntimeResetError);

      expect(
        window.localStorage.getItem(runtimeGenerationTestIds.marker),
      ).toBeNull();
    },
  );

  it("does not bless residual databases when IndexedDB enumeration fails", async () => {
    const deleteDatabase = vi.fn();
    const factory = {
      databases: vi.fn().mockRejectedValue(new Error("database list failed")),
      deleteDatabase,
    } as unknown as IDBFactory;

    await expect(
      prepareDesktopRuntimeGeneration(
        { shell: "tauri", generation: 2 },
        { localStorage: window.localStorage, indexedDB: factory },
      ),
    ).rejects.toBeInstanceOf(DesktopRuntimeResetError);

    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(
      window.localStorage.getItem(runtimeGenerationTestIds.marker),
    ).toBeNull();
  });

  it("leaves the marker unset after a cache failure and succeeds on retry", async () => {
    const keys = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("cache is locked"))
      .mockResolvedValue([]);
    const cacheStorage = { keys } as unknown as CacheStorage;

    await expect(
      prepareDesktopRuntimeGeneration(
        { shell: "tauri", generation: 2 },
        { localStorage: window.localStorage, cacheStorage },
      ),
    ).rejects.toBeInstanceOf(DesktopRuntimeResetError);
    expect(
      window.localStorage.getItem(runtimeGenerationTestIds.marker),
    ).toBeNull();

    await expect(
      prepareDesktopRuntimeGeneration(
        { shell: "tauri", generation: 2 },
        { localStorage: window.localStorage, cacheStorage },
      ),
    ).resolves.toBe(true);
    expect(window.localStorage.getItem(runtimeGenerationTestIds.marker)).toBe(
      runtimeGenerationTestIds.tauriGeneration,
    );
  });
});

function deleteFailureFactory(failure: "blocked" | "error"): IDBFactory {
  return {
    deleteDatabase: () => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (failure === "blocked") {
          request.onblocked?.call(
            request,
            new Event("blocked") as IDBVersionChangeEvent,
          );
        } else {
          request.onerror?.call(request, new Event("error"));
        }
      });
      return request;
    },
  } as unknown as IDBFactory;
}

function openDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () =>
      reject(request.error ?? new Error(`Could not open ${name}.`));
  });
}
