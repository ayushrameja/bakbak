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
  const [includeAudio, setIncludeAudio] = useState(false);
  const [settings, setSettings] =
    useState<ScreenShareSettings>(initialSettings);
  const [sourceKind, setSourceKind] = useState<"display" | "application">(
    "display",
  );
  const [sources, setSources] = useState<ScreenShareSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  useEffect(() => {
    if (!customPicker) return;
    let cancelled = false;
    void listScreenShareSources()
      .then((availableSources) => {
        if (cancelled) return;
        setSources(availableSources);
        setSelectedSourceId(
          availableSources.find((source) => source.kind === sourceKind)?.id ??
            null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSourceError("Bakbak could not enumerate shareable sources.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customPicker, sourceKind]);

  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ?? null;
  const sourceAudioAvailable =
    audioAvailable &&
    (!customPicker || selectedSource?.audioAvailable === true);
  return (
    <Modal
      eyebrow="Present"
      title="Share your screen"
      description="Bakbak will open your system picker so you stay in control of what everyone sees."
      onClose={onClose}
    >
      <div className="screen-share-dialog">
        <div className="screen-share-dialog__preview">
          <MonitorUp size={28} />
          <div>
            <strong>Choose a display, app, or window</strong>
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
                Screens
              </button>
              <button
                className={sourceKind === "application" ? "is-active" : ""}
                type="button"
                role="tab"
                aria-selected={sourceKind === "application"}
                onClick={() => setSourceKind("application")}
              >
                Applications
              </button>
            </div>
            {sourceError ? <p role="alert">{sourceError}</p> : null}
            <div className="screen-share-dialog__source-grid">
              {sources
                .filter((source) => source.kind === sourceKind)
                .map((source) => (
                  <button
                    className={
                      source.id === selectedSourceId ? "is-selected" : ""
                    }
                    type="button"
                    key={source.id}
                    onClick={() => {
                      setSelectedSourceId(source.id);
                      if (!source.audioAvailable) setIncludeAudio(false);
                    }}
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
        <label className={!sourceAudioAvailable ? "is-disabled" : ""}>
          <input
            type="checkbox"
            checked={includeAudio}
            disabled={!sourceAudioAvailable}
            onChange={(event) => setIncludeAudio(event.target.checked)}
          />
          <span>
            <strong>Include system audio</strong>
            <small>
              {sourceAudioAvailable
                ? "Only audio belonging to the selected source is included."
                : (audioUnavailableReason ??
                  "Matched audio is unavailable on this system; video still works.")}
            </small>
          </span>
        </label>
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
                onStart(includeAudio, settings, selectedSourceId);
              } else {
                onStart(includeAudio, settings);
              }
            }}
            disabled={customPicker && !selectedSourceId}
          >
            <MonitorUp size={17} /> Choose source
          </button>
        </div>
      </div>
    </Modal>
  );
}
