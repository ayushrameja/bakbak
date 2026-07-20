import { ArrowLeft, Expand, Monitor, Shrink } from "lucide-react";
import { ParticipantVideo } from "./ParticipantVideo";
import {
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_RESOLUTIONS,
  type ScreenShareSettings,
} from "./screen-share-preferences";
import type { VoiceScreenShare } from "./useVoiceRoom";

export function ScreenShareStage({
  share,
  settings,
  settingsPending,
  fullscreen,
  fullscreenError,
  onBack,
  onActivateMedia,
  onToggleFullscreen,
  onUpdateSettings,
}: {
  share: VoiceScreenShare;
  settings: ScreenShareSettings;
  settingsPending: boolean;
  fullscreen: boolean;
  fullscreenError: string | null;
  onBack: () => void;
  onActivateMedia: () => void;
  onToggleFullscreen: () => void;
  onUpdateSettings: (settings: ScreenShareSettings) => void;
}) {
  return (
    <section className="screen-share-stage" aria-label="Screen share stage">
      <div
        className="screen-share-stage__media"
        role="button"
        tabIndex={0}
        aria-label="Return focused screen share to grid"
        onClick={onActivateMedia}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivateMedia();
          }
        }}
      >
        {share.track ? (
          <ParticipantVideo
            track={share.track}
            local={false}
            label={share.displayName}
            kind="screen"
          />
        ) : (
          <div className="screen-share-stage__waiting">
            <Monitor size={30} />
            <span>Waiting for the first frame…</span>
          </div>
        )}
        {share.paused ? (
          <div className="screen-share-paused">Source minimized or paused</div>
        ) : null}
        {fullscreenError ? (
          <div className="voice-fullscreen-error" role="status">
            {fullscreenError}
          </div>
        ) : null}
      </div>
      <div className="screen-share-stage__controls">
        <button
          className="secondary-button screen-share-stage__back"
          type="button"
          onClick={onBack}
          aria-label="Back to grid"
        >
          <ArrowLeft size={17} />
          Back to grid
        </button>
        {share.isLocal ? (
          <div className="screen-share-stage__quality">
            <select
              aria-label="Live screen share resolution"
              value={settings.resolution}
              disabled={settingsPending}
              onChange={(event) =>
                onUpdateSettings({
                  ...settings,
                  resolution: Number(
                    event.target.value,
                  ) as ScreenShareSettings["resolution"],
                })
              }
            >
              {SCREEN_SHARE_RESOLUTIONS.map((resolution) => (
                <option value={resolution} key={resolution}>
                  {resolution}p
                </option>
              ))}
            </select>
            <select
              aria-label="Live screen share frame rate"
              value={settings.frameRate}
              disabled={settingsPending}
              onChange={(event) =>
                onUpdateSettings({
                  ...settings,
                  frameRate: Number(
                    event.target.value,
                  ) as ScreenShareSettings["frameRate"],
                })
              }
            >
              {SCREEN_SHARE_FRAME_RATES.map((frameRate) => (
                <option value={frameRate} key={frameRate}>
                  {frameRate} fps
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button
          className={`screen-share-stage__icon-button ${fullscreen ? "screen-share-stage__fullscreen-exit" : ""}`}
          type="button"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fullscreen ? <Shrink size={17} /> : <Expand size={17} />}
        </button>
      </div>
    </section>
  );
}
