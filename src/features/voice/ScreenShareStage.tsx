import { Monitor } from "lucide-react";
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
  onActivateMedia,
  onUpdateSettings,
}: {
  share: VoiceScreenShare;
  settings: ScreenShareSettings;
  settingsPending: boolean;
  onActivateMedia: () => void;
  onUpdateSettings: (settings: ScreenShareSettings) => void;
}) {
  return (
    <section className="screen-share-stage" aria-label="Screen share stage">
      <div
        className="screen-share-stage__media"
        role="button"
        tabIndex={0}
        aria-label="Return focused screen share to people"
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
      </div>
      {share.isLocal ? (
        <div className="screen-share-stage__controls">
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
        </div>
      ) : null}
    </section>
  );
}
