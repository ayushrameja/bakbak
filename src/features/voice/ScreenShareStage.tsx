import {
  ArrowLeft,
  Expand,
  Monitor,
  Shrink,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ParticipantVideo } from "./ParticipantVideo";
import {
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_RESOLUTIONS,
  type ScreenShareSettings,
} from "./screen-share-preferences";
import type { VoiceScreenShare } from "./useVoiceRoom";

export function ScreenShareStage({
  share,
  localSourceLabel,
  settings,
  settingsPending,
  fullscreen,
  onBack,
  onToggleFullscreen,
  onUpdateSettings,
}: {
  share: VoiceScreenShare;
  localSourceLabel: string | null;
  settings: ScreenShareSettings;
  settingsPending: boolean;
  fullscreen: boolean;
  onBack: () => void;
  onToggleFullscreen: () => void;
  onUpdateSettings: (settings: ScreenShareSettings) => void;
}) {
  const sourceLabel =
    share.isLocal && localSourceLabel ? localSourceLabel : "Shared screen";

  return (
    <section className="screen-share-stage" aria-label="Screen share stage">
      <header>
        <button
          className={
            share.isLocal
              ? "screen-share-stage__icon-button"
              : "secondary-button"
          }
          type="button"
          onClick={onBack}
          aria-label={
            share.isLocal ? "Return to gallery" : "Stop watching screen share"
          }
        >
          <ArrowLeft size={17} />
          {!share.isLocal ? "Stop watching" : null}
        </button>
        <div>
          <Monitor size={17} />
          <span>
            <strong>{share.displayName}</strong>
            <small>{sourceLabel}</small>
          </span>
        </div>
        <span
          className={`screen-share-stage__audio ${share.audioPublished ? "is-live" : ""}`}
        >
          {share.audioPublished ? <Volume2 size={14} /> : <VolumeX size={14} />}
          {share.audioPublished ? "Source audio" : "Video only"}
        </span>
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
          className="screen-share-stage__icon-button"
          type="button"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fullscreen ? <Shrink size={17} /> : <Expand size={17} />}
        </button>
      </header>
      <div className="screen-share-stage__media">
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
      </div>
    </section>
  );
}
