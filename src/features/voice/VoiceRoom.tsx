import {
  ArrowLeft,
  CircleAlert,
  Expand,
  LoaderCircle,
  Mic,
  MicOff,
  Monitor,
  RefreshCw,
  Shrink,
  Volume2,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { AppUser, Channel, ServerMember } from "../../lib/types";
import { ParticipantVideo } from "./ParticipantVideo";
import { ScreenShareStage } from "./ScreenShareStage";
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
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] =
    useState(true);
  const fullscreenRef = useRef(false);
  const fullscreenControlsTimerRef = useRef<number | null>(null);
  const {
    participants: voiceParticipants,
    screenShares,
    stopWatchingScreenShare,
  } = voice;

  const applyFullscreenState = useCallback((next: boolean) => {
    if (next) {
      document.documentElement.dataset.voiceFullscreen = "true";
    } else {
      document.documentElement.removeAttribute("data-voice-fullscreen");
    }
    if (fullscreenRef.current === next) return;
    fullscreenRef.current = next;
    setFullscreen(next);
  }, []);

  const reconcileFullscreen = useCallback(async () => {
    if (!isTauri()) {
      applyFullscreenState(false);
      return false;
    }
    try {
      const actual = await getCurrentWindow().isFullscreen();
      applyFullscreenState(actual);
      return actual;
    } catch {
      applyFullscreenState(false);
      return false;
    }
  }, [applyFullscreenState]);

  const requestFullscreen = useCallback(
    async (next: boolean) => {
      if (!isTauri() || (next && !focusedTarget)) return;
      setFullscreenError(null);
      try {
        await getCurrentWindow().setFullscreen(next);
      } catch {
        setFullscreenError(
          next
            ? "Bakbak could not enter fullscreen."
            : "Bakbak could not exit fullscreen.",
        );
      } finally {
        await reconcileFullscreen();
      }
    },
    [focusedTarget, reconcileFullscreen],
  );

  const revealFullscreenControls = useCallback(() => {
    if (!fullscreen) return;
    setFullscreenControlsVisible(true);
    if (fullscreenControlsTimerRef.current !== null) {
      window.clearTimeout(fullscreenControlsTimerRef.current);
    }
    fullscreenControlsTimerRef.current = window.setTimeout(() => {
      setFullscreenControlsVisible(false);
      fullscreenControlsTimerRef.current = null;
    }, 2_500);
  }, [fullscreen]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const sync = () => {
      if (!disposed) void reconcileFullscreen();
    };
    void Promise.all([
      getCurrentWindow().onResized(sync),
      getCurrentWindow().onFocusChanged(sync),
    ]).then((listeners) => {
      if (disposed) listeners.forEach((unlisten) => unlisten());
      else unlisteners.push(...listeners);
    });
    void reconcileFullscreen();
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [reconcileFullscreen]);

  useEffect(() => {
    if (fullscreen) {
      revealFullscreenControls();
      return;
    }
    setFullscreenControlsVisible(true);
    if (fullscreenControlsTimerRef.current !== null) {
      window.clearTimeout(fullscreenControlsTimerRef.current);
      fullscreenControlsTimerRef.current = null;
    }
  }, [fullscreen, revealFullscreenControls]);

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
    stopWatchingScreenShare();
    if (fullscreen) void requestFullscreen(false);
  }, [
    focusedTarget,
    fullscreen,
    isConnected,
    requestFullscreen,
    screenShares,
    stopWatchingScreenShare,
    voiceParticipants,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fullscreen) {
        event.preventDefault();
        void requestFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [fullscreen, requestFullscreen]);

  useEffect(
    () => () => {
      document.documentElement.removeAttribute("data-voice-fullscreen");
      if (fullscreenControlsTimerRef.current !== null) {
        window.clearTimeout(fullscreenControlsTimerRef.current);
      }
      if (isTauri()) {
        void getCurrentWindow()
          .setFullscreen(false)
          .catch(() => undefined);
      }
    },
    [],
  );

  const returnToGallery = useCallback(() => {
    setFocusedTarget(null);
    if (fullscreen) void requestFullscreen(false);
  }, [fullscreen, requestFullscreen]);

  const focusTarget = (target: MediaTarget) => {
    if (focusedTarget?.kind === target.kind && focusedTarget.id === target.id) {
      returnToGallery();
      return;
    }
    setFocusedTarget(target);
    const share =
      target.kind === "screen"
        ? voice.screenShares.find((candidate) => candidate.id === target.id)
        : null;
    if (share && !share.isLocal) {
      voice.watchScreenShare(share.id);
    } else {
      voice.stopWatchingScreenShare();
    }
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
              <div className="voice-device-error__actions">
                <button type="button" onClick={onOpenSettings}>
                  Review output
                </button>
                <button
                  className="voice-device-error__dismiss"
                  type="button"
                  aria-label="Dismiss output warning"
                  onClick={voice.dismissOutputDeviceError}
                >
                  <X size={15} />
                </button>
              </div>
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
              className={`voice-focus-layout ${fullscreen ? "is-fullscreen" : ""} ${fullscreen && !fullscreenControlsVisible ? "controls-hidden" : ""}`}
              onPointerMove={revealFullscreenControls}
              onFocusCapture={revealFullscreenControls}
              onKeyDown={revealFullscreenControls}
            >
              {focusedShare ? (
                <ScreenShareStage
                  share={focusedShare}
                  settings={voice.screenShareSettings}
                  settingsPending={voice.screenShareSettingsPending}
                  fullscreen={fullscreen}
                  fullscreenError={fullscreenError}
                  onBack={returnToGallery}
                  onActivateMedia={returnToGallery}
                  onToggleFullscreen={() => void requestFullscreen(!fullscreen)}
                  onUpdateSettings={(settings) =>
                    void voice.updateScreenShareSettings(settings)
                  }
                />
              ) : focusedParticipant ? (
                <section
                  className="voice-participant-stage"
                  aria-label={`${focusedParticipant.displayName} focused`}
                >
                  <ParticipantCard
                    participant={focusedParticipant}
                    members={members}
                    user={user}
                    voice={voice}
                    loadProfileMedia={loadProfileMedia}
                    onOpenProfile={onOpenProfile}
                    openProfileId={openProfileId}
                    onFocus={returnToGallery}
                    focused
                  />
                  <div className="voice-participant-stage__controls">
                    <button
                      type="button"
                      className="secondary-button voice-participant-stage__back"
                      onClick={returnToGallery}
                    >
                      <ArrowLeft size={17} />
                      Back to grid
                    </button>
                    <button
                      type="button"
                      className={`screen-share-stage__icon-button ${fullscreen ? "voice-fullscreen-exit" : ""}`}
                      onClick={() => void requestFullscreen(!fullscreen)}
                      aria-label={
                        fullscreen ? "Exit fullscreen" : "Enter fullscreen"
                      }
                    >
                      {fullscreen ? <Shrink size={16} /> : <Expand size={16} />}
                    </button>
                  </div>
                  {fullscreenError ? (
                    <div className="voice-fullscreen-error" role="status">
                      {fullscreenError}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : (
            <div
              className="voice-media-gallery"
              data-target-count={
                voice.participants.length + voice.screenShares.length
              }
              data-layout={mediaGalleryLayout(
                voice.participants.length + voice.screenShares.length,
              )}
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
                  watched={
                    share.isLocal || voice.watchedScreenShareId === share.id
                  }
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
            {() => <strong>{displayName}</strong>}
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
  watched,
  onFocus,
}: {
  share: VoiceScreenShare;
  localSourceLabel: string | null;
  watched: boolean;
  onFocus: () => void;
}) {
  return (
    <button
      className="screen-share-tile"
      type="button"
      onClick={onFocus}
      aria-label={
        share.isLocal || watched
          ? `Focus ${share.displayName}'s screen share`
          : `Watch ${share.displayName}'s screen share`
      }
    >
      <span className="screen-share-tile__media">
        {(share.isLocal || watched) && share.track ? (
          <ParticipantVideo
            track={share.track}
            local={share.isLocal}
            label={share.displayName}
            kind="screen"
          />
        ) : (
          <span className="screen-share-stage__waiting">
            <Monitor size={30} />
            <span>
              {share.isLocal || watched
                ? "Waiting for the first frame…"
                : "Watch stream"}
            </span>
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

function mediaGalleryLayout(
  targetCount: number,
): "solo" | "pair" | "quad" | "six" | "many" {
  if (targetCount <= 1) return "solo";
  if (targetCount === 2) return "pair";
  if (targetCount <= 4) return "quad";
  if (targetCount <= 6) return "six";
  return "many";
}
