import {
  CircleAlert,
  Mic,
  MicOff,
  Phone,
  Radio,
  RefreshCw,
  Settings2,
  Volume2,
} from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type {
  AppUser,
  Channel,
  ServerMember,
  VoiceRoomOccupant,
} from "../../lib/types";
import { ParticipantVideo } from "./ParticipantVideo";
import { ScreenShareStage } from "./ScreenShareStage";
import { VoiceElapsedTime } from "./VoiceElapsedTime";
import type { useVoiceRoom } from "./useVoiceRoom";

interface VoiceRoomProps {
  channel: Channel;
  user: AppUser;
  members?: ServerMember[];
  voice: ReturnType<typeof useVoiceRoom>;
  occupants: VoiceRoomOccupant[];
  onOpenSettings: () => void;
}

export function VoiceRoom({
  channel,
  user,
  members = [],
  voice,
  occupants,
  onOpenSettings,
}: VoiceRoomProps) {
  const isThisRoom = voice.channel?.id === channel.id;
  const isConnected = isThisRoom && voice.status === "connected";
  const isBusy =
    isThisRoom &&
    (voice.status === "connecting" || voice.status === "reconnecting");

  return (
    <section
      className={`voice-room-view ${isConnected ? "is-connected" : ""} ${voice.screenShares.length > 0 ? "has-screen-share" : ""}`}
    >
      {!isThisRoom || voice.status === "disconnected" ? (
        <div className="prejoin-voice-card">
          <div className="prejoin-voice-card__copy">
            <span className="eyebrow">
              <Radio size={14} /> Voice room
            </span>
            <h2>{channel.name}</h2>
            <p>{channel.topic}</p>
          </div>
          <div className="prejoin-voice-card__presence">
            <div className="voice-presence-pill">
              <i />
              {occupants.length > 0
                ? `${occupants.length} talking now`
                : "Room is open"}
            </div>
            {occupants.length > 0 ? (
              <div className="prejoin-voice-card__people">
                {occupants.map((occupant) => (
                  <div key={occupant.userId}>
                    <Avatar
                      user={{
                        displayName: occupant.displayName,
                        avatarUrl: occupant.avatarUrl,
                        status: "online",
                      }}
                      size="small"
                      showStatus
                    />
                    <span>
                      <strong>{occupant.displayName}</strong>
                      <VoiceElapsedTime joinedAt={occupant.joinedAt} />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="prejoin-voice-card__actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => void voice.join(channel)}
            >
              <Phone size={18} /> Join voice
            </button>
            <button
              className="text-button"
              type="button"
              onClick={onOpenSettings}
            >
              <Settings2 size={15} /> Check microphone
            </button>
          </div>
        </div>
      ) : null}

      {isBusy ? (
        <div className="voice-loading">
          <RefreshCw size={24} />
          <h3>
            {voice.status === "reconnecting"
              ? "Finding the room again…"
              : "Joining quietly…"}
          </h3>
          <p>LiveKit is setting up a secure, short-lived voice session.</p>
        </div>
      ) : null}

      {isThisRoom && voice.status === "error" ? (
        <div className="voice-error">
          <span>Voice took a small dramatic pause.</span>
          <p>{voice.error}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void voice.join(channel)}
          >
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      ) : null}

      {isConnected ? (
        <>
          {voice.audioPlaybackBlocked ? (
            <div className="voice-audio-notice" role="alert">
              <Volume2 size={18} />
              <div>
                <strong>Room audio needs one click</strong>
                <span>
                  {voice.deafened
                    ? "Room audio stays paused while Deafen is on. Undeafen to retry."
                    : (voice.error ??
                      "Your browser paused autoplay. Enable it to hear everyone.")}
                </span>
              </div>
              {!voice.deafened ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void voice.resumeAudio()}
                >
                  Enable audio
                </button>
              ) : null}
            </div>
          ) : null}
          {voice.inputDeviceError ? (
            <div className="voice-device-error" role="alert">
              <CircleAlert size={16} />
              <span>{voice.inputDeviceError}</span>
              <button type="button" onClick={onOpenSettings}>
                Review device
              </button>
            </div>
          ) : null}
          {voice.cameraDeviceError ? (
            <div className="voice-device-error" role="alert">
              <CircleAlert size={16} />
              <span>{voice.cameraDeviceError}</span>
              <button type="button" onClick={onOpenSettings}>
                Review camera
              </button>
            </div>
          ) : null}
          {voice.outputDeviceError ? (
            <div className="voice-device-error" role="alert">
              <CircleAlert size={16} />
              <span>{voice.outputDeviceError}</span>
              <button type="button" onClick={onOpenSettings}>
                Review output
              </button>
            </div>
          ) : null}
          {voice.screenShareError ? (
            <div className="voice-device-error" role="alert">
              <CircleAlert size={16} />
              <span>{voice.screenShareError}</span>
            </div>
          ) : null}
          <ScreenShareStage
            shares={voice.screenShares}
            selectedId={voice.selectedScreenShareId}
            localSourceLabel={voice.screenShareSourceLabel}
            onSelect={voice.selectScreenShare}
          />
          <div
            className={`participant-grid ${voice.screenShares.length > 0 ? "is-strip" : ""}`}
          >
            {voice.participants.map((participant) => {
              const latestSound = participant.activeSounds.at(-1);
              const soundActive = participant.activeSounds.length > 0;
              const member = members.find(
                (candidate) => candidate.id === participant.id,
              );
              const displayName =
                member?.displayName ?? participant.displayName;
              const avatarUser =
                member ??
                (participant.isLocal
                  ? user
                  : {
                      displayName,
                      avatarUrl: null,
                      status: "online" as const,
                    });
              return (
                <article
                  className={`participant-card ${participant.isSpeaking || soundActive ? "is-speaking" : ""} ${soundActive ? "is-soundboard-active" : ""}`}
                  key={participant.id}
                >
                  <div className="participant-card__media">
                    {participant.cameraEnabled && participant.cameraTrack ? (
                      <ParticipantVideo
                        track={participant.cameraTrack}
                        local={participant.isLocal}
                        label={displayName}
                      />
                    ) : (
                      <div className="participant-card__avatar">
                        <Avatar user={avatarUser} size="large" />
                        <span className="speaker-rings" />
                      </div>
                    )}
                    {latestSound ? (
                      <span
                        className="participant-card__sound"
                        aria-label={`${displayName} is playing ${latestSound.label}`}
                      >
                        {latestSound.emoji}
                        {participant.activeSounds.length > 1 ? (
                          <i>+{participant.activeSounds.length - 1}</i>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <div className="participant-card__identity">
                    <strong>
                      {displayName}
                      {participant.isLocal ? " (you)" : ""}
                    </strong>
                    <span>
                      {soundActive
                        ? participant.activeSounds.length > 1
                          ? `${participant.activeSounds.length} sounds playing`
                          : `Playing ${latestSound?.label ?? "sound"}`
                        : participant.isSpeaking
                          ? "Speaking"
                          : participant.isMuted
                            ? "Muted"
                            : "Listening"}
                    </span>
                    {participant.joinedAt ? (
                      <VoiceElapsedTime joinedAt={participant.joinedAt} />
                    ) : null}
                  </div>
                  <span
                    className={`participant-card__mic ${participant.isMuted ? "muted" : ""} ${soundActive && !participant.isMuted ? "active" : ""}`}
                  >
                    {participant.isMuted ? (
                      <MicOff size={14} />
                    ) : (
                      <Mic size={14} />
                    )}
                  </span>
                  {!participant.isLocal ? (
                    <label
                      className="participant-volume"
                      aria-label={`${displayName} volume`}
                    >
                      <Volume2 size={14} />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={participant.volume}
                        onChange={(event) =>
                          voice.setParticipantVolume(
                            participant.id,
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
