import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useEffect } from "react";
import { APP_VERSION, BUILD_REVISION } from "../../lib/app-version";
import { getDesktopBridge, isDesktopRuntime } from "../../lib/desktop-runtime";
import {
  AppUpdateContext,
  type AppUpdateContextValue,
  type AppUpdateFailure,
  type AppUpdateStatus,
} from "./app-update-context";

const RELEASES_URL = "https://github.com/ayushrameja/bakbak/releases";
const LAST_SUCCESSFUL_CHECK_KEY = "bakbak:update:last-successful-check:v1";
const DEFAULT_STARTUP_DELAY_MS = 3_000;
const CHECK_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_RETRY_DELAYS_MS = [2_000, 5_000] as const;

interface AppUpdateProviderProps {
  children: ReactNode;
  autoCheck?: boolean;
  startupDelayMs?: number;
  retryDelaysMs?: readonly number[];
}

function readLastSuccessfulCheck(): string | null {
  try {
    return window.localStorage.getItem(LAST_SUCCESSFUL_CHECK_KEY);
  } catch {
    return null;
  }
}

function saveLastSuccessfulCheck(value: string): void {
  try {
    window.localStorage.setItem(LAST_SUCCESSFUL_CHECK_KEY, value);
  } catch {
    // Update checks still work when device-local storage is unavailable.
  }
}

function classifyCheckFailure(error: unknown): AppUpdateFailure {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("timeout") || message.includes("timed out")
    ? "timeout"
    : "service";
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export function AppUpdateProvider({
  children,
  autoCheck = true,
  startupDelayMs = DEFAULT_STARTUP_DELAY_MS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}: AppUpdateProviderProps) {
  const [status, setStatus] = useState<AppUpdateStatus>("idle");
  const [failure, setFailure] = useState<AppUpdateFailure | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [lastSuccessfulCheckAt, setLastSuccessfulCheckAt] = useState(
    readLastSuccessfulCheck,
  );
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);
  const checkPromiseRef = useRef<Promise<void> | null>(null);
  const maxAttempts = retryDelaysMs.length + 1;

  const checkForUpdates = useCallback((): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setStatus("unsupported");
      return Promise.resolve();
    }
    if (checkPromiseRef.current) return checkPromiseRef.current;

    const run = async () => {
      setStatus("checking");
      setFailure(null);

      for (let index = 0; index < maxAttempts; index += 1) {
        setAttempt(index + 1);
        try {
          const result = await bridge.updates.check(CHECK_TIMEOUT_MS);
          if (!result.supported) {
            setUpdateAvailable(false);
            setAvailableVersion(null);
            setStatus("unsupported");
            return;
          }
          const checkedAt = new Date().toISOString();
          setUpdateAvailable(result.available);
          setAvailableVersion(result.version);
          setStatus(result.available ? "available" : "up-to-date");
          setLastCheckedAt(checkedAt);
          setLastSuccessfulCheckAt(checkedAt);
          saveLastSuccessfulCheck(checkedAt);
          return;
        } catch (caught) {
          const nextDelay = retryDelaysMs[index];
          if (nextDelay !== undefined) {
            await wait(nextDelay);
            continue;
          }

          const finalFailure = classifyCheckFailure(caught);
          setFailure(finalFailure);
          setStatus(finalFailure === "offline" ? "offline" : "failed");
          setLastCheckedAt(new Date().toISOString());
        }
      }
    };

    const promise = run().finally(() => {
      if (checkPromiseRef.current === promise) checkPromiseRef.current = null;
    });
    checkPromiseRef.current = promise;
    return promise;
  }, [maxAttempts, retryDelaysMs]);

  useEffect(() => {
    if (!autoCheck || !isDesktopRuntime()) return;
    const timeout = window.setTimeout(() => {
      void checkForUpdates();
    }, startupDelayMs);
    return () => window.clearTimeout(timeout);
  }, [autoCheck, checkForUpdates, startupDelayMs]);

  const installUpdate = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!updateAvailable || !bridge) return;
    setStatus("installing");
    setFailure(null);
    setDownloadedBytes(0);
    setContentLength(null);

    const stopProgress = bridge.updates.onProgress((progress) => {
      setContentLength(progress.total);
      setDownloadedBytes(progress.transferred);
    });

    try {
      await bridge.updates.downloadAndInstall(DOWNLOAD_TIMEOUT_MS);
    } catch {
      setFailure("install");
      setStatus("install-failed");
    } finally {
      stopProgress();
    }
  }, [updateAvailable]);

  const openReleasesPage = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (bridge) {
      try {
        await bridge.external.open(RELEASES_URL);
        return;
      } catch {
        // The browser fallback still gives the user a manual recovery path.
      }
    }
    window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
  }, []);

  const copyDiagnostics = useCallback(async () => {
    const diagnostics = JSON.stringify(
      {
        appVersion: APP_VERSION,
        buildRevision: BUILD_REVISION,
        status,
        failure,
        availableVersion,
        attempt,
        maxAttempts,
        lastCheckedAt,
        lastSuccessfulCheckAt,
        online: typeof navigator === "undefined" ? null : navigator.onLine,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(diagnostics);
      return true;
    } catch {
      return false;
    }
  }, [
    attempt,
    availableVersion,
    failure,
    lastCheckedAt,
    lastSuccessfulCheckAt,
    maxAttempts,
    status,
  ]);

  const value = useMemo<AppUpdateContextValue>(
    () => ({
      status,
      failure,
      availableVersion,
      attempt,
      maxAttempts,
      lastCheckedAt,
      lastSuccessfulCheckAt,
      downloadedBytes,
      contentLength,
      checkForUpdates,
      installUpdate,
      openReleasesPage,
      copyDiagnostics,
    }),
    [
      attempt,
      availableVersion,
      checkForUpdates,
      contentLength,
      copyDiagnostics,
      downloadedBytes,
      failure,
      installUpdate,
      lastCheckedAt,
      lastSuccessfulCheckAt,
      maxAttempts,
      openReleasesPage,
      status,
    ],
  );

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  );
}
