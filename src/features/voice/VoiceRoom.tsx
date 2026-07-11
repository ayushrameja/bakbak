import {
  AudioLines,
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Radio,
  RefreshCw,
  Settings2,
  Volume2,
} from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type { AppUser, Channel } from "../../lib/types";
import { Soundboard } from "../soundboard/Soundboard";
import type { useVoiceRoom } from "./useVoiceRoom";

interface VoiceRoomProps {
  channel: Channel;
  user: AppUser;
  voice: ReturnType<typeof useVoiceRoom>;
  onOpenSettings: () => void;
}

export function VoiceRoom({
  channel,
  user,
  voice,
  onOpenSettings,
}: VoiceRoomProps) {
  const isThisRoom = voice.channel?.id === channel.id;
  const isConnected = isThisRoom && voice.status === "connected";
  const isBusy =
    isThisRoom &&
    (voice.status === "connecting" || voice.status === "reconnecting");

  return (
    <section className="voice-room-view">
      <div className="voice-room-hero">
        <div className="voice-room-hero__copy">
          <span className="eyebrow">
            <Radio size={14} /> Drop-in voice
          </span>
          <h2>{channel.name}</h2>
          <p>{channel.topic}</p>
        </div>
        <div className={`voice-presence-pill ${isConnected ? "is-live" : ""}`}>
          <i />{" "}
          {isConnected
            ? `${voice.participants.length} in the room`
            : "Room is open"}
        </div>
      </div>

      {!isThisRoom || voice.status === "disconnected" ? (
        <div className="join-voice-card">
          <div className="join-voice-card__orbit">
            <AudioLines size={34} />
            <i />
            <i />
            <i />
          </div>
          <h3>Pull up a chair</h3>
          <p>
            You can listen first, mute whenever, and leave without writing a
            farewell essay.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void voice.join(channel)}
          >
            <Phone size={18} /> Join {channel.name}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={onOpenSettings}
          >
            <Settings2 size={15} /> Check microphone first
          </button>
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
          <div className="participant-grid">
            {voice.participants.map((participant) => {
              const avatarUser = participant.isLocal
                ? user
                : {
                    displayName: participant.displayName,
                    avatarUrl: null,
                    status: "online" as const,
                  };
              return (
                <article
                  className={`participant-card ${participant.isSpeaking ? "is-speaking" : ""}`}
                  key={participant.id}
                >
                  <div className="participant-card__avatar">
                    <Avatar user={avatarUser} size="large" />
                    <span className="speaker-rings" />
                  </div>
                  <div className="participant-card__identity">
                    <strong>
                      {participant.displayName}
                      {participant.isLocal ? " (you)" : ""}
                    </strong>
                    <span>
                      {participant.isSpeaking
                        ? "Speaking"
                        : participant.isMuted
                          ? "Muted"
                          : "Listening"}
                    </span>
                  </div>
                  <span
                    className={`participant-card__mic ${participant.isMuted ? "muted" : ""}`}
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
                      aria-label={`${participant.displayName} volume`}
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
          <div className="voice-main-controls">
            <button
              className={voice.muted ? "is-danger" : ""}
              type="button"
              onClick={() => void voice.toggleMute()}
            >
              {voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
              <span>{voice.muted ? "Unmute" : "Mute"}</span>
            </button>
            <button
              className={voice.deafened ? "is-danger" : ""}
              type="button"
              onClick={voice.toggleDeafen}
            >
              {voice.deafened ? (
                <HeadphoneOff size={20} />
              ) : (
                <Headphones size={20} />
              )}
              <span>{voice.deafened ? "Undeafen" : "Deafen"}</span>
            </button>
            <button type="button" onClick={onOpenSettings}>
              <Settings2 size={20} />
              <span>Devices</span>
            </button>
            <button
              className="hangup"
              type="button"
              onClick={() => void voice.leave()}
            >
              <PhoneOff size={20} />
              <span>Leave</span>
            </button>
          </div>
          <Soundboard connected onPlay={voice.dispatchSound} />
        </>
      ) : null}
    </section>
  );
}
