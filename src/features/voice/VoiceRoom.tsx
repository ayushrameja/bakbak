import {
  CircleAlert,
  Expand,
  LoaderCircle,
  Mic,
  MicOff,
  Monitor,
  RefreshCw,
  Shrink,
  Volume2,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
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
import type { VoiceParticipant, VoiceScreenShare } from "./useVoiceRoom";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

type MediaTarget =
  { kind: "participant"; id: string } | { kind: "screen"; id: string };

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
  const [focusedTarget, setFocusedTarget] = useState<MediaTarget | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const {
    participants: voiceParticipants,
    screenShares,
    selectScreenShare,
  } = voice;

  const exitFullscreen = useCallback(async () => {
    if (isTauri()) {
      await getCurrentWindow()
        .setFullscreen(false)
        .catch(() => undefined);
    }
    document.documentElement.removeAttribute("data-voice-fullscreen");
    setFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!focusedTarget || !isTauri()) return;
    const appWindow = getCurrentWindow();
    const next = !(await appWindow.isFullscreen());
    await appWindow.setFullscreen(next);
    if (next) {
      document.documentElement.dataset.voiceFullscreen = "true";
    } else {
      document.documentElement.removeAttribute("data-voice-fullscreen");
    }
    setFullscreen(next);
  }, [focusedTarget]);

  useEffect(() => {
    const targetStillExists =
      focusedTarget?.kind === "participant"
        ? voiceParticipants.some(
            (participant) => participant.id === focusedTarget.id,
          )
        : focusedTarget?.kind === "screen"
          ? screenShares.some((share) => share.id === focusedTarget.id)
          : true;
    if (isConnected && targetStillExists) return;
    setFocusedTarget(null);
    selectScreenShare(null);
    if (fullscreen) void exitFullscreen();
  }, [
    exitFullscreen,
    focusedTarget,
    fullscreen,
    isConnected,
    screenShares,
    selectScreenShare,
    voiceParticipants,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fullscreen) {
        event.preventDefault();
        void exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitFullscreen, fullscreen]);

  useEffect(
    () => () => {
      document.documentElement.removeAttribute("data-voice-fullscreen");
      if (isTauri()) {
        void getCurrentWindow()
          .setFullscreen(false)
          .catch(() => undefined);
      }
    },
    [],
  );

  const focusTarget = (target: MediaTarget) => {
    setFocusedTarget(target);
    voice.selectScreenShare(target.kind === "screen" ? target.id : null);
  };

  const returnToGallery = () => {
    setFocusedTarget(null);
    voice.selectScreenShare(null);
    if (fullscreen) void exitFullscreen();
  };

  const focusedParticipant =
    focusedTarget?.kind === "participant"
      ? (voice.participants.find(
          (participant) => participant.id === focusedTarget.id,
        ) ?? null)
      : null;
  const focusedShare =
    focusedTarget?.kind === "screen"
      ? (voice.screenShares.find((share) => share.id === focusedTarget.id) ??
        null)
      : null;

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
          {focusedTarget ? (
            <div
              className={`voice-focus-layout ${fullscreen ? "is-fullscreen" : ""}`}
            >
              {focusedShare ? (
                <ScreenShareStage
                  share={focusedShare}
                  localSourceLabel={voice.screenShareSourceLabel}
                  settings={voice.screenShareSettings}
                  settingsPending={voice.screenShareSettingsPending}
                  fullscreen={fullscreen}
                  onBack={returnToGallery}
                  onToggleFullscreen={() => void toggleFullscreen()}
                  onUpdateSettings={(settings) =>
                    void voice.updateScreenShareSettings(settings)
                  }
                />
              ) : focusedParticipant ? (
                <section
                  className="voice-participant-stage"
                  aria-label={`${focusedParticipant.displayName} focused`}
                >
                  <header>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={returnToGallery}
                    >
                      Gallery
                    </button>
                    <strong>{focusedParticipant.displayName}</strong>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void toggleFullscreen()}
                      aria-label={
                        fullscreen ? "Exit fullscreen" : "Enter fullscreen"
                      }
                    >
                      {fullscreen ? <Shrink size={16} /> : <Expand size={16} />}
                    </button>
                  </header>
                  <ParticipantCard
                    participant={focusedParticipant}
                    members={members}
                    user={user}
                    voice={voice}
                    loadProfileMedia={loadProfileMedia}
                    onOpenProfile={onOpenProfile}
                    openProfileId={openProfileId}
                    focused
                  />
                </section>
              ) : null}
              <MediaTargetStrip
                participants={voice.participants}
                shares={voice.screenShares}
                focused={focusedTarget}
                onFocus={focusTarget}
              />
            </div>
          ) : (
            <div
              className="voice-media-gallery"
              data-target-count={
                voice.participants.length + voice.screenShares.length
              }
            >
              {voice.participants.map((participant) => (
                <ParticipantCard
                  key={`participant:${participant.id}`}
                  participant={participant}
                  members={members}
                  user={user}
                  voice={voice}
                  loadProfileMedia={loadProfileMedia}
                  onOpenProfile={onOpenProfile}
                  openProfileId={openProfileId}
                  onFocus={() =>
                    focusTarget({ kind: "participant", id: participant.id })
                  }
                />
              ))}
              {voice.screenShares.map((share) => (
                <ScreenShareTile
                  key={`screen:${share.id}`}
                  share={share}
                  localSourceLabel={voice.screenShareSourceLabel}
                  onFocus={() => focusTarget({ kind: "screen", id: share.id })}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function ParticipantCard({
  participant,
  members,
  user,
  voice,
  loadProfileMedia,
  onOpenProfile,
  openProfileId,
  onFocus,
  focused = false,
}: {
  participant: VoiceParticipant;
  members: ServerMember[];
  user: AppUser;
  voice: ReturnType<typeof useVoiceRoom>;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  openProfileId: string | null;
  onFocus?: () => void;
  focused?: boolean;
}) {
  const latestSound = participant.activeSounds.at(-1);
  const soundActive = participant.activeSounds.length > 0;
  const member = members.find((candidate) => candidate.id === participant.id);
  const displayName = member?.displayName ?? participant.displayName;
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
    member ?? (participant.isLocal ? { ...user, role: "member" } : null);

  return (
    <article
      className={`participant-card ${focused ? "is-focused" : ""} ${participant.isSpeaking || soundActive ? "is-speaking" : ""} ${soundActive ? "is-soundboard-active" : ""}`}
      onClick={(event) => {
        if (
          onFocus &&
          !(event.target as HTMLElement).closest("button,input,label")
        ) {
          onFocus();
        }
      }}
      onKeyDown={(event) => {
        if (onFocus && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onFocus();
        }
      }}
      role={onFocus ? "button" : undefined}
      tabIndex={onFocus ? 0 : undefined}
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
        {participant.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
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
}

function ScreenShareTile({
  share,
  localSourceLabel,
  onFocus,
}: {
  share: VoiceScreenShare;
  localSourceLabel: string | null;
  onFocus: () => void;
}) {
  return (
    <button
      className="screen-share-tile"
      type="button"
      onClick={onFocus}
      aria-label={`Focus ${share.displayName}'s screen share`}
    >
      <span className="screen-share-tile__media">
        {share.track ? (
          <ParticipantVideo
            track={share.track}
            local={false}
            label={share.displayName}
            kind="screen"
          />
        ) : (
          <span className="screen-share-stage__waiting">
            <Monitor size={30} />
            <span>Waiting for the first frame…</span>
          </span>
        )}
        {share.paused ? (
          <span className="screen-share-paused">
            Source minimized or paused
          </span>
        ) : null}
      </span>
      <span className="screen-share-tile__identity">
        <Monitor size={15} />
        <span>
          <strong>{share.displayName}</strong>
          <small>
            {share.isLocal && localSourceLabel
              ? localSourceLabel
              : "Shared screen"}
          </small>
        </span>
      </span>
    </button>
  );
}

function MediaTargetStrip({
  participants,
  shares,
  focused,
  onFocus,
}: {
  participants: VoiceParticipant[];
  shares: VoiceScreenShare[];
  focused: MediaTarget;
  onFocus: (target: MediaTarget) => void;
}) {
  return (
    <nav className="media-target-strip" aria-label="Voice room media targets">
      {participants.map((participant) => (
        <button
          className={
            focused.kind === "participant" && focused.id === participant.id
              ? "is-active"
              : ""
          }
          type="button"
          key={`participant:${participant.id}`}
          onClick={() => onFocus({ kind: "participant", id: participant.id })}
        >
          {participant.cameraEnabled ? "📹" : "●"} {participant.displayName}
        </button>
      ))}
      {shares.map((share) => (
        <button
          className={
            focused.kind === "screen" && focused.id === share.id
              ? "is-active"
              : ""
          }
          type="button"
          key={`screen:${share.id}`}
          onClick={() => onFocus({ kind: "screen", id: share.id })}
        >
          <Monitor size={13} /> {share.displayName}
        </button>
      ))}
    </nav>
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
