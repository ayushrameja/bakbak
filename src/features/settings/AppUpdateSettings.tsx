import {
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { APP_VERSION } from "../../lib/app-version";
import { useAppUpdate, type AppUpdateStatus } from "./app-update-context";

function formatCheckedAt(value: string | null): string {
  if (!value) return "Not yet checked on this device";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet checked on this device";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusCopy(
  status: AppUpdateStatus,
  version: string | null,
  attempt: number,
  maxAttempts: number,
): { title: string; detail: string; tone: string } {
  switch (status) {
    case "checking":
      return {
        title: "Checking for updates…",
        detail: `Attempt ${Math.max(1, attempt)} of ${maxAttempts}. GitHub can take a moment on a busy route.`,
        tone: "checking",
      };
    case "up-to-date":
      return {
        title: "Bakbak is up to date",
        detail: `You are running the newest release, ${APP_VERSION}.`,
        tone: "success",
      };
    case "available":
      return {
        title: `Bakbak ${version ?? "update"} is ready`,
        detail:
          "Install when you are between conversations, then Bakbak will restart.",
        tone: "available",
      };
    case "offline":
      return {
        title: "You appear to be offline",
        detail: "Reconnect, then check again. Your current app is unchanged.",
        tone: "warning",
      };
    case "failed":
      return {
        title: "The update service did not respond",
        detail: `Bakbak tried ${maxAttempts} times. You can retry or open the GitHub download page.`,
        tone: "warning",
      };
    case "installing":
      return {
        title: `Installing Bakbak ${version ?? "update"}…`,
        detail: "Keep Bakbak open while the signed update downloads.",
        tone: "checking",
      };
    case "install-failed":
      return {
        title: "The update could not be installed",
        detail:
          "Your current app is unchanged. Try again or use the GitHub download page.",
        tone: "warning",
      };
    case "unsupported":
      return {
        title: "Updates run in the desktop app",
        detail: "Browser preview does not install desktop releases.",
        tone: "neutral",
      };
    default:
      return {
        title: "Ready to check",
        detail: "Bakbak checks quietly after startup, or you can check now.",
        tone: "neutral",
      };
  }
}

export function AppUpdateSettings() {
  const updater = useAppUpdate();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const copy = statusCopy(
    updater.status,
    updater.availableVersion,
    updater.attempt,
    updater.maxAttempts,
  );
  const progress =
    updater.contentLength && updater.contentLength > 0
      ? Math.min(
          100,
          Math.round((updater.downloadedBytes / updater.contentLength) * 100),
        )
      : null;
  const busy = updater.status === "checking" || updater.status === "installing";
  const hasUpdate = updater.availableVersion !== null;
  const showReleaseFallback =
    updater.status === "failed" ||
    updater.status === "offline" ||
    updater.status === "install-failed";

  async function copyDiagnostics() {
    const copied = await updater.copyDiagnostics();
    setCopyState(copied ? "copied" : "failed");
  }

  return (
    <div className="settings-panel update-settings">
      <div className="settings-panel__heading">
        <span className="eyebrow">Desktop updates</span>
        <h2>Updates</h2>
        <p>
          Check, recover, and install without waiting for the startup notice.
        </p>
      </div>

      <section
        className={`update-settings__status is-${copy.tone}`}
        aria-live="polite"
      >
        <div className="update-settings__status-icon" aria-hidden="true">
          {copy.tone === "success" ? (
            <CheckCircle2 size={21} />
          ) : copy.tone === "warning" ? (
            <TriangleAlert size={21} />
          ) : (
            <RefreshCw
              className={updater.status === "checking" ? "spin" : undefined}
              size={21}
            />
          )}
        </div>
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.detail}</p>
        </div>
      </section>

      {updater.status === "installing" && progress !== null ? (
        <div
          className="update-settings__progress"
          role="progressbar"
          aria-label="Update download progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <i style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      ) : null}

      <dl className="update-settings__facts">
        <div>
          <dt>Installed version</dt>
          <dd>{APP_VERSION}</dd>
        </div>
        <div>
          <dt>Available version</dt>
          <dd>{updater.availableVersion ?? "—"}</dd>
        </div>
        <div>
          <dt>Last successful check</dt>
          <dd>{formatCheckedAt(updater.lastSuccessfulCheckAt)}</dd>
        </div>
      </dl>

      <div className="update-settings__actions">
        {hasUpdate ? (
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => void updater.installUpdate()}
          >
            {updater.status === "installing" ? (
              <RefreshCw className="spin" size={15} />
            ) : (
              <Download size={15} />
            )}
            {updater.status === "install-failed"
              ? "Try installation again"
              : "Update and restart"}
          </button>
        ) : (
          <button
            className="primary-button"
            type="button"
            disabled={busy || updater.status === "unsupported"}
            onClick={() => void updater.checkForUpdates()}
          >
            <RefreshCw
              className={updater.status === "checking" ? "spin" : undefined}
              size={15}
            />
            {updater.status === "checking" ? "Checking…" : "Check for updates"}
          </button>
        )}
        {showReleaseFallback ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => void updater.openReleasesPage()}
          >
            <ExternalLink size={15} /> Open GitHub releases
          </button>
        ) : null}
      </div>

      <div className="update-settings__diagnostics">
        <div>
          <strong>Need help?</strong>
          <span>
            Copy version and update-state details without account, message, or
            credential data.
          </span>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => void copyDiagnostics()}
        >
          <Clipboard size={14} />
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy update diagnostics"}
        </button>
      </div>
    </div>
  );
}
