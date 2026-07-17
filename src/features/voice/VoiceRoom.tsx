import {
  CircleAlert,
  LoaderCircle,
  Mic,
  MicOff,
  RefreshCw,
  Volume2,
} from "lucide-react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { AppUser, Channel, ServerMember } from "../../lib/types";
import { ParticipantVideo } from "./ParticipantVideo";
import { ScreenShareStage } from "./ScreenShareStage";
import { VoiceElapsedTime } from "./VoiceElapsedTime";
import type { useVoiceRoom } from "./useVoiceRoom";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

interface VoiceRoomProps {
  channel: Channel;
  user: AppUser;
  members?: ServerMember[];
  voice: ReturnType<typeof useVoiceRoom>;
  onOpenSettings: () => void;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  openProfileId?: string | null;
}

export function VoiceRoom({
  channel,
  user,
  members = [],
  voice,
  onOpenSettings,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  openProfileId = null,
}: VoiceRoomProps) {
  const isThisRoom = voice.channel?.id === channel.id;
  const isConnected = isThisRoom && voice.status === "connected";
  const isConnecting = isThisRoom && voice.status === "connecting";
  const isReconnecting = isThisRoom && voice.status === "reconnecting";
  const participantLayout =
    voice.participants.length === 1
      ? "is-solo"
      : voice.participants.length === 2
        ? "is-pair"
        : "is-group";

  return (
    <section
      className={`voice-room-view ${isConnected ? "is-connected" : ""} ${voice.screenShares.length > 0 ? "has-screen-share" : ""}`}
    >
      {isConnecting || isReconnecting ? (
        <div className="voice-loading" role="status" aria-live="polite">
          <LoaderCircle size={25} />
          <strong>
            {isReconnecting
              ? `Reconnecting to ${channel.name}…`
              : `Connecting to ${channel.name}…`}
          </strong>
          <span>
            {isReconnecting
              ? "Finding the room again…"
              : describeJoinStage(voice.joinStage)}
          </span>
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
            className={`participant-grid ${participantLayout} ${voice.screenShares.length > 0 ? "is-strip" : ""}`}
            data-participant-count={voice.participants.length}
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
                  ? { ...user, role: "member" }
                  : {
                      displayName,
                      avatarUrl: null,
                      status: "online" as const,
                    });
              const profileMember =
                member ??
                (participant.isLocal ? { ...user, role: "member" } : null);
              return (
                <article
                  className={`participant-card ${participant.isSpeaking || soundActive ? "is-speaking" : ""} ${soundActive ? "is-soundboard-active" : ""}`}
                  key={participant.id}
                >
                  <div className="participant-card__media">
                    {participant.cameraEnabled && participant.cameraTrack ? (
                      <>
                        <ParticipantVideo
                          track={participant.cameraTrack}
                          local={participant.isLocal}
                          label={displayName}
                        />
                        {latestSound ? (
                          <SoundEmoji
                            key={latestSound.eventId}
                            emoji={latestSound.emoji}
                            label={`${displayName} is playing ${latestSound.label}`}
                            count={participant.activeSounds.length}
                            maximum={voice.maxConcurrentSounds}
                            overlay
                          />
                        ) : null}
                      </>
                    ) : latestSound ? (
                      <SoundEmoji
                        key={latestSound.eventId}
                        emoji={latestSound.emoji}
                        label={`${displayName} is playing ${latestSound.label}`}
                        count={participant.activeSounds.length}
                        maximum={voice.maxConcurrentSounds}
                      />
                    ) : (
                      <div className="participant-card__avatar">
                        {profileMember ? (
                          <ProfileTrigger
                            className="participant-card__profile-avatar"
                            member={profileMember}
                            loadMedia={loadProfileMedia}
                            onOpenProfile={onOpenProfile}
                            expanded={openProfileId === profileMember.id}
                            aria-label={`View ${displayName}'s profile`}
                          >
                            {({ animationUrl, animated }) => (
                              <Avatar
                                user={profileMember}
                                size="large"
                                animationUrl={animationUrl}
                                animated={animated}
                              />
                            )}
                          </ProfileTrigger>
                        ) : (
                          <Avatar user={avatarUser} size="large" />
                        )}
                        <span className="speaker-rings" />
                      </div>
                    )}
                  </div>
                  <div className="participant-card__identity">
                    {profileMember ? (
                      <ProfileTrigger
                        className="participant-card__profile-name"
                        member={profileMember}
                        loadMedia={loadProfileMedia}
                        onOpenProfile={onOpenProfile}
                        expanded={openProfileId === profileMember.id}
                      >
                        {() => (
                          <strong>
                            {displayName}
                            {participant.isLocal ? " (you)" : ""}
                          </strong>
                        )}
                      </ProfileTrigger>
                    ) : (
                      <strong>{displayName}</strong>
                    )}
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

function SoundEmoji({
  emoji,
  label,
  count,
  maximum,
  overlay = false,
}: {
  emoji: string;
  label: string;
  count: number;
  maximum: number;
  overlay?: boolean;
}) {
  return (
    <span
      className={`participant-card__sound-emoji ${overlay ? "is-overlay" : "is-avatar"}`}
      aria-label={label}
      role="img"
    >
      <b aria-hidden="true">{emoji}</b>
      {count > 1 ? (
        <i>
          {count}/{maximum}
        </i>
      ) : null}
    </span>
  );
}

function describeJoinStage(
  stage: ReturnType<typeof useVoiceRoom>["joinStage"],
) {
  if (stage === "authorizing") return "Checking room access…";
  if (stage === "connecting") return "Finding the fastest voice route…";
  if (stage === "microphone") return "Starting your microphone…";
  if (stage === "soundboard") return "Preparing room audio…";
  return "Preparing voice…";
}
