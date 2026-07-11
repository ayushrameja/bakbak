import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { Download, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

const DEFAULT_CHECK_DELAY_MS = 3_000;

interface AppUpdateNoticeProps {
  checkDelayMs?: number;
}

type InstallState = "available" | "installing" | "failed";

export function AppUpdateNotice({
  checkDelayMs = DEFAULT_CHECK_DELAY_MS,
}: AppUpdateNoticeProps) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installState, setInstallState] = useState<InstallState>("available");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      void check({ timeout: 15_000 })
        .then((availableUpdate) => {
          if (active && availableUpdate) setUpdate(availableUpdate);
        })
        .catch(() => {
          // Update checks are opportunistic. A later launch will try again.
        });
    }, checkDelayMs);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [checkDelayMs]);

  if (!update || dismissed) return null;

  const progress =
    contentLength && contentLength > 0
      ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
      : null;

  const handleDownloadEvent = (event: DownloadEvent) => {
    if (event.event === "Started") {
      setContentLength(event.data.contentLength ?? null);
      setDownloadedBytes(0);
    }
    if (event.event === "Progress") {
      setDownloadedBytes((current) => current + event.data.chunkLength);
    }
  };

  const installUpdate = async () => {
    setInstallState("installing");
    setDownloadedBytes(0);
    setContentLength(null);

    try {
      await update.downloadAndInstall(handleDownloadEvent);
      await relaunch();
    } catch {
      setInstallState("failed");
    }
  };

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <div className="update-notice__icon" aria-hidden="true">
        <Sparkles size={18} />
      </div>
      <div className="update-notice__content">
        <strong>Bakbak {update.version} is ready</strong>
        <span>
          {installState === "installing"
            ? progress === null
              ? "Downloading the update…"
              : `Downloading the update… ${progress}%`
            : installState === "failed"
              ? "The update could not be installed. Your current app is unchanged."
              : "Update when you are between conversations."}
        </span>
        {installState === "installing" && progress !== null ? (
          <div
            className="update-notice__progress"
            role="progressbar"
            aria-label="Update download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <i style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        <div className="update-notice__actions">
          <button
            className="primary-button update-notice__install"
            type="button"
            disabled={installState === "installing"}
            onClick={() => void installUpdate()}
          >
            {installState === "installing" ? (
              <RefreshCw className="spin" size={14} />
            ) : (
              <Download size={14} />
            )}
            {installState === "failed" ? "Try again" : "Update and restart"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={installState === "installing"}
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
        </div>
      </div>
      <button
        className="icon-button update-notice__dismiss"
        type="button"
        disabled={installState === "installing"}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update"
      >
        <X size={15} />
      </button>
    </aside>
  );
}
