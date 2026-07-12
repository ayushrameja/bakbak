import { Monitor, Volume2, VolumeX } from "lucide-react";
import { ParticipantVideo } from "./ParticipantVideo";
import type { VoiceScreenShare } from "./useVoiceRoom";

export function ScreenShareStage({
  shares,
  selectedId,
  localSourceLabel,
  onSelect,
}: {
  shares: VoiceScreenShare[];
  selectedId: string | null;
  localSourceLabel: string | null;
  onSelect: (shareId: string) => void;
}) {
  const selected = shares.find((share) => share.id === selectedId) ?? shares[0];
  if (!selected) return null;
  const sourceLabel =
    selected.isLocal && localSourceLabel ? localSourceLabel : "Shared screen";

  return (
    <section className="screen-share-stage" aria-label="Screen share stage">
      <header>
        <div>
          <Monitor size={17} />
          <span>
            <strong>{selected.displayName}</strong>
            <small>{sourceLabel}</small>
          </span>
        </div>
        <span
          className={`screen-share-stage__audio ${selected.audioPublished ? "is-live" : ""}`}
        >
          {selected.audioPublished ? (
            <Volume2 size={14} />
          ) : (
            <VolumeX size={14} />
          )}
          {selected.audioPublished ? "Source audio" : "Video only"}
        </span>
      </header>
      <div className="screen-share-stage__media">
        {selected.track ? (
          <ParticipantVideo
            track={selected.track}
            local={false}
            label={selected.displayName}
            kind="screen"
          />
        ) : (
          <div className="screen-share-stage__waiting">
            <Monitor size={30} />
            <span>Waiting for the first frame…</span>
          </div>
        )}
      </div>
      {shares.length > 1 ? (
        <nav aria-label="Active screen shares">
          {shares.map((share) => (
            <button
              className={share.id === selected.id ? "is-active" : ""}
              type="button"
              key={share.id}
              onClick={() => onSelect(share.id)}
            >
              <Monitor size={14} /> {share.displayName}
            </button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
