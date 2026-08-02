import { Download, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useAppUpdate } from "./app-update-context";

export function AppUpdateNotice() {
  const updater = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  if (!updater.availableVersion || dismissed) return null;

  const progress =
    updater.contentLength && updater.contentLength > 0
      ? Math.min(
          100,
          Math.round((updater.downloadedBytes / updater.contentLength) * 100),
        )
      : null;
  const installing = updater.status === "installing";
  const installFailed = updater.status === "install-failed";

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <div className="update-notice__icon" aria-hidden="true">
        <Sparkles size={18} />
      </div>
      <div className="update-notice__content">
        <strong>Bakbak {updater.availableVersion} is ready</strong>
        <span>
          {installing
            ? progress === null
              ? "Downloading the update…"
              : `Downloading the update… ${progress}%`
            : installFailed
              ? "The update could not be installed. Your current app is unchanged."
              : "Update when you are between conversations."}
        </span>
        {installing && progress !== null ? (
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
            disabled={installing}
            onClick={() => void updater.installUpdate()}
          >
            {installing ? (
              <RefreshCw className="spin" size={14} />
            ) : (
              <Download size={14} />
            )}
            {installFailed ? "Try again" : "Update and restart"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={installing}
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
        </div>
      </div>
      <button
        className="icon-button update-notice__dismiss"
        type="button"
        disabled={installing}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update"
      >
        <X size={15} />
      </button>
    </aside>
  );
}
