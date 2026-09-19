import type { BakbakDesktopBridge } from "./desktop-runtime";

const RUNTIME_GENERATION_KEY = "bakbak:desktop-runtime-generation";
const TAURI_RUNTIME_GENERATION = "tauri:2";
const KNOWN_DATABASES = ["bakbak-cache", "bakbak-soundboard"] as const;
const DEFAULT_BLOCKED_DELETE_TIMEOUT_MS = 2_000;

interface RuntimeResetEnvironment {
  localStorage?: Storage;
  sessionStorage?: Storage;
  indexedDB?: IDBFactory;
  cacheStorage?: CacheStorage;
  blockedDeleteTimeoutMs?: number;
}

export class DesktopRuntimeResetError extends Error {
  constructor() {
    super(
      "Bakbak could not finish clearing data from the previous desktop runtime.",
    );
    this.name = "DesktopRuntimeResetError";
  }
}

export async function prepareDesktopRuntimeGeneration(
  runtime: BakbakDesktopBridge["runtime"] | undefined,
  environment: RuntimeResetEnvironment = browserEnvironment(),
): Promise<boolean> {
  if (runtime?.shell !== "tauri" || runtime.generation !== 2) return false;

  const storage = environment.localStorage;
  if (storage?.getItem(RUNTIME_GENERATION_KEY) === TAURI_RUNTIME_GENERATION) {
    return false;
  }

  try {
    storage?.clear();
    environment.sessionStorage?.clear();
    await Promise.all([
      clearIndexedDatabases(
        environment.indexedDB,
        environment.blockedDeleteTimeoutMs ?? DEFAULT_BLOCKED_DELETE_TIMEOUT_MS,
      ),
      clearCacheStorage(environment.cacheStorage),
    ]);
    storage?.setItem(RUNTIME_GENERATION_KEY, TAURI_RUNTIME_GENERATION);
    return true;
  } catch {
    throw new DesktopRuntimeResetError();
  }
}

async function clearIndexedDatabases(
  factory: IDBFactory | undefined,
  blockedDeleteTimeoutMs: number,
) {
  if (!factory) return;
  const discovered = await discoverDatabaseNames(factory);
  const names = new Set([...KNOWN_DATABASES, ...discovered]);
  await Promise.all(
    [...names].map((name) =>
      deleteDatabase(factory, name, blockedDeleteTimeoutMs),
    ),
  );
}

async function discoverDatabaseNames(factory: IDBFactory): Promise<string[]> {
  if (typeof factory.databases !== "function") return [];
  const databases = await factory.databases();
  return databases.flatMap(({ name }) => (name ? [name] : []));
}

function deleteDatabase(
  factory: IDBFactory,
  name: string,
  blockedDeleteTimeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    let settled = false;
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (result: "success" | "failure") => {
      if (settled) return;
      settled = true;
      if (blockedTimer !== null) clearTimeout(blockedTimer);
      if (result === "success") resolve();
      else reject(new Error("Desktop runtime database reset failed."));
    };
    request.onsuccess = () => finish("success");
    request.onerror = () => finish("failure");
    request.onblocked = () => {
      if (blockedTimer !== null) return;
      blockedTimer = setTimeout(
        () => finish("failure"),
        Math.max(0, blockedDeleteTimeoutMs),
      );
    };
  });
}

async function clearCacheStorage(storage: CacheStorage | undefined) {
  if (!storage) return;
  const names = await storage.keys();
  const deleted = await Promise.all(names.map((name) => storage.delete(name)));
  if (deleted.some((result) => !result)) {
    throw new Error("Desktop runtime cache reset failed.");
  }
}

function browserEnvironment(): RuntimeResetEnvironment {
  if (typeof window === "undefined") return {};
  return {
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    indexedDB: window.indexedDB,
    cacheStorage: window.caches,
  };
}

export const runtimeGenerationTestIds = {
  marker: RUNTIME_GENERATION_KEY,
  tauriGeneration: TAURI_RUNTIME_GENERATION,
} as const;
