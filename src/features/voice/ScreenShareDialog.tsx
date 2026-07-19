import { MonitorUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import {
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_RESOLUTIONS,
  type ScreenShareSettings,
} from "./screen-share-preferences";
import {
  listScreenShareSources,
  openScreenRecordingSettings,
  restartDesktopApp,
  type ScreenShareSource,
} from "./screen-share-service";

export function ScreenShareDialog({
  audioAvailable,
  audioUnavailableReason,
  customPicker = false,
  initialSettings,
  onStart,
  onClose,
}: {
  audioAvailable: boolean;
  audioUnavailableReason: string | null;
  customPicker?: boolean;
  initialSettings: ScreenShareSettings;
  onStart: (
    includeAudio: boolean,
    settings: ScreenShareSettings,
    sourceId?: string | null,
  ) => void;
  onClose: () => void;
}) {
  const [includeAudio, setIncludeAudio] = useState(audioAvailable);
  const [settings, setSettings] =
    useState<ScreenShareSettings>(initialSettings);
  const [sourceKind, setSourceKind] = useState<"display" | "application">(
    "display",
  );
  const [sources, setSources] = useState<ScreenShareSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!customPicker) return;
    let cancelled = false;
    setSourcesLoading(true);
    setSourceError(null);
    void listScreenShareSources()
      .then((availableSources) => {
        if (cancelled) return;
        setSources(availableSources);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSources([]);
        setSelectedSourceId(null);
        setSourceError(describeSourceError(error));
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customPicker, reloadToken]);

  const visibleSources = sources.filter((source) => source.kind === sourceKind);
  const macPermissionError =
    sourceError?.toLowerCase().includes("permission") === true ||
    sourceError?.toLowerCase().includes("screen access") === true ||
    sourceError?.toLowerCase().includes("tcc") === true;

  useEffect(() => {
    if (!customPicker) return;
    const visible = sources.filter((source) => source.kind === sourceKind);
    if (visible.some((source) => source.id === selectedSourceId)) {
      return;
    }
    setSelectedSourceId(visible[0]?.id ?? null);
  }, [customPicker, selectedSourceId, sourceKind, sources]);

  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ?? null;
  const sourceAudioAvailable =
    audioAvailable &&
    (!customPicker || selectedSource?.audioAvailable === true);

  return (
    <Modal
      eyebrow="Present"
      title="Share your screen"
      description={
        customPicker
          ? "Pick an entire screen or an application, then share it with the room."
          : "Bakbak will open your system picker so you stay in control of what everyone sees."
      }
      onClose={onClose}
    >
      <div className="screen-share-dialog">
        <div className="screen-share-dialog__preview">
          <MonitorUp size={28} />
          <div>
            <strong>
              {customPicker
                ? "Choose an entire screen or application"
                : "Choose a display, app, or window"}
            </strong>
            <span>Sharing stops automatically when you leave voice.</span>
          </div>
        </div>
        {customPicker ? (
          <div className="screen-share-dialog__sources">
            <div role="tablist" aria-label="Screen share source type">
              <button
                className={sourceKind === "display" ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={sourceKind === "display"}
                onClick={() => setSourceKind("display")}
              >
                Entire screen
              </button>
              <button
                className={sourceKind === "application" ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={sourceKind === "application"}
                onClick={() => setSourceKind("application")}
              >
                Application
              </button>
            </div>
            {sourceError ? (
              <div className="screen-share-dialog__source-status" role="alert">
                <p>{sourceError}</p>
                <div className="screen-share-dialog__source-actions">
                  {macPermissionError ? (
                    <>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void openScreenRecordingSettings()}
                      >
                        Open Privacy Settings
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => void restartDesktopApp()}
                      >
                        Restart Bakbak
                      </button>
                    </>
                  ) : null}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setReloadToken((current) => current + 1)}
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : null}
            {sourcesLoading ? (
              <p className="screen-share-dialog__source-status">
                Loading shareable sources…
              </p>
            ) : null}
            {!sourcesLoading && !sourceError && visibleSources.length === 0 ? (
              <div className="screen-share-dialog__source-status">
                <p>
                  {sourceKind === "display"
                    ? "No screens are available to share right now."
                    : "No applications are available to share right now."}
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setReloadToken((current) => current + 1)}
                >
                  Retry
                </button>
              </div>
            ) : null}
            <div className="screen-share-dialog__source-grid">
              {visibleSources.map((source) => (
                <button
                  className={
                    source.id === selectedSourceId ? "is-selected" : ""
                  }
                  type="button"
                  aria-pressed={source.id === selectedSourceId}
                  key={source.id}
                  onClick={() => setSelectedSourceId(source.id)}
                >
                  {source.thumbnailDataUrl ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      src={source.thumbnailDataUrl}
                    />
                  ) : (
                    <span aria-hidden="true">
                      <MonitorUp size={22} />
                    </span>
                  )}
                  <strong>{source.label}</strong>
                  {source.applicationLabel ? (
                    <small>{source.applicationLabel}</small>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="screen-share-dialog__quality">
          <label>
            <span>Resolution</span>
            <select
              aria-label="Screen share resolution"
              value={settings.resolution}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  resolution: Number(
                    event.target.value,
                  ) as ScreenShareSettings["resolution"],
                }))
              }
            >
              {SCREEN_SHARE_RESOLUTIONS.map((resolution) => (
                <option value={resolution} key={resolution}>
                  {resolution}p
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Frame rate</span>
            <select
              aria-label="Screen share frame rate"
              value={settings.frameRate}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  frameRate: Number(
                    event.target.value,
                  ) as ScreenShareSettings["frameRate"],
                }))
              }
            >
              {SCREEN_SHARE_FRAME_RATES.map((frameRate) => (
                <option value={frameRate} key={frameRate}>
                  {frameRate} fps
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className={`screen-share-dialog__audio ${!sourceAudioAvailable ? "is-disabled" : ""}`}
        >
          <div>
            <strong>Include system audio</strong>
            <small>
              {sourceAudioAvailable
                ? "Only audio belonging to the selected source is included."
                : (audioUnavailableReason ??
                  "Matched audio is unavailable on this system; video still works.")}
            </small>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Include system audio"
            aria-checked={includeAudio && sourceAudioAvailable}
            disabled={!sourceAudioAvailable}
            onClick={() => setIncludeAudio((current) => !current)}
          >
            {includeAudio && sourceAudioAvailable ? "On" : "Off"}
          </button>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              onClose();
              if (customPicker) {
                onStart(
                  includeAudio && sourceAudioAvailable,
                  settings,
                  selectedSourceId,
                );
              } else {
                onStart(includeAudio && sourceAudioAvailable, settings);
              }
            }}
            disabled={
              customPicker &&
              (sourcesLoading || !selectedSourceId || Boolean(sourceError))
            }
          >
            <MonitorUp size={17} /> {customPicker ? "Share" : "Choose source"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function describeSourceError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Bakbak could not enumerate shareable sources.";
}
