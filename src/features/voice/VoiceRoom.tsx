import {
  CircleAlert,
  LoaderCircle,
  Mic,
  MicOff,
  Monitor,
  PhoneCall,
  RefreshCw,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { OpenUserContextMenu } from "../../components/UserContextMenu";
import { resolveGiphyProfileMedia } from "../../lib/profile-giphy-media";
import { AVATAR_BUCKET } from "../../lib/profile-service";
import type { AppUser, Channel, ServerMember } from "../../lib/types";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { ParticipantVideo } from "./ParticipantVideo";
import { ScreenShareStage } from "./ScreenShareStage";
import {
  openPermissionSettings,
  restartDesktopApp,
} from "./screen-share-service";
import type { useVoiceRoom } from "./useVoiceRoom";
import type { VoiceParticipant, VoiceScreenShare } from "./useVoiceRoom";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

export interface StreamWatchRequest {
  requestId: number;
  ownerId: string;
  channelId: string;
}

interface VoiceRoomProps {
  channel: Channel;
  user: AppUser;
  members?: ServerMember[];
  voice: ReturnType<typeof useVoiceRoom>;
  onOpenSettings: () => void;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId?: string | null;
  streamWatchRequest?: StreamWatchRequest | null;
  onStreamWatchHandled?: (
    requestId: number,
    outcome: "opened" | "missing",
  ) => void;
}

export function VoiceRoom({
  channel,
  user,
  members = [],
  voice,
  onOpenSettings,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  onOpenUserContextMenu,
  openProfileId = null,
  streamWatchRequest = null,
  onStreamWatchHandled,
}: VoiceRoomProps) {
  const isThisRoom = voice.channel?.id === channel.id;
  const isConnected = isThisRoom && voice.status === "connected";
  const isConnecting = isThisRoom && voice.status === "connecting";
  const isReconnecting = isThisRoom && voice.status === "reconnecting";
  const [focusedShareId, setFocusedShareId] = useState<string | null>(null);
  const [diagnosticsCopyState, setDiagnosticsCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const handledStreamWatchRef = useRef<number | null>(null);
  const {
    participants: voiceParticipants,
    screenShares,
    stopWatchingScreenShare,
  } = voice;
  useEffect(() => {
    setDiagnosticsCopyState("idle");
  }, [voice.voiceContinuityWarning]);

  useEffect(() => {
    const targetStillExists = focusedShareId
      ? screenShares.some((share) => share.id === focusedShareId)
      : true;
    if (isConnected && targetStillExists) return;
    setFocusedShareId(null);
    stopWatchingScreenShare();
  }, [focusedShareId, isConnected, screenShares, stopWatchingScreenShare]);

  useEffect(() => {
    if (
      !streamWatchRequest ||
      streamWatchRequest.channelId !== channel.id ||
      !isConnected ||
      handledStreamWatchRef.current === streamWatchRequest.requestId
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      if (handledStreamWatchRef.current === streamWatchRequest.requestId) {
        return;
      }
      handledStreamWatchRef.current = streamWatchRequest.requestId;
      onStreamWatchHandled?.(streamWatchRequest.requestId, "missing");
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [channel.id, isConnected, onStreamWatchHandled, streamWatchRequest]);

  useEffect(() => {
    if (
      !streamWatchRequest ||
      streamWatchRequest.channelId !== channel.id ||
      !isConnected ||
      handledStreamWatchRef.current === streamWatchRequest.requestId
    ) {
      return;
    }
    const share = screenShares.find(
      (candidate) =>
        !candidate.isLocal && candidate.ownerId === streamWatchRequest.ownerId,
    );
    if (!share) return;
    handledStreamWatchRef.current = streamWatchRequest.requestId;
    voice.watchScreenShare(share.id);
    setFocusedShareId(share.id);
    onStreamWatchHandled?.(streamWatchRequest.requestId, "opened");
  }, [
    channel.id,
    isConnected,
    onStreamWatchHandled,
    screenShares,
    streamWatchRequest,
    voice,
  ]);

  useEffect(() => {
    if (
      streamWatchRequest?.channelId === channel.id &&
      isThisRoom &&
      voice.status === "error" &&
      handledStreamWatchRef.current !== streamWatchRequest.requestId
    ) {
      handledStreamWatchRef.current = streamWatchRequest.requestId;
      onStreamWatchHandled?.(streamWatchRequest.requestId, "missing");
    }
  }, [
    channel.id,
    isThisRoom,
    onStreamWatchHandled,
    streamWatchRequest,
    voice.status,
  ]);

  const returnToPeople = useCallback(() => setFocusedShareId(null), []);

  const focusShare = (share: VoiceScreenShare) => {
    setFocusedShareId(share.id);
    if (!share.isLocal) {
      voice.watchScreenShare(share.id);
    }
  };

  const focusedShare = focusedShareId
    ? (voice.screenShares.find((share) => share.id === focusedShareId) ?? null)
    : null;
  const participantIds = new Set(
    voiceParticipants.map((participant) => participant.id),
  );
  const orphanScreenShares = screenShares.filter(
    (share) => !participantIds.has(share.ownerId),
  );
  const peopleCount = voiceParticipants.length + orphanScreenShares.length;

  return (
    <section
      className={`voice-room-view ${isConnected ? "is-connected" : ""} ${voice.screenShares.length > 0 ? "has-screen-share" : ""} ${focusedShare ? "is-focused-share" : ""}`}
      data-view={focusedShare ? "focused-share" : "people"}
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
          {voice.microphonePermission ? (
            <button
              className="secondary-button"
              type="button"
              onClick={onOpenSettings}
            >
              Review microphone
            </button>
          ) : null}
        </div>
      ) : null}

      {!isConnected &&
      !isConnecting &&
      !isReconnecting &&
      !(isThisRoom && voice.status === "error") ? (
        <div className="voice-empty-state">
          <span className="voice-empty-state__icon" aria-hidden="true">
            <PhoneCall size={24} />
          </span>
          <span className="eyebrow">The room survived your exit</span>
          <h2>No voices. Just premium silence.</h2>
          <p>
            Pick any voice room from the left, or rejoin {channel.name}. You can
            give up, obviously—but then who will deliver your excellent point
            badly?
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void voice.join(channel)}
          >
            <PhoneCall size={16} /> Rejoin {channel.name}
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
          {voice.voiceContinuityWarning ? (
            <div className="voice-device-error" role="alert">
              <CircleAlert size={16} />
              <span>{voice.voiceContinuityWarning}</span>
              <button
                type="button"
                onClick={() => {
                  void voice
                    .copyVoiceDiagnostics()
                    .then((copied) =>
                      setDiagnosticsCopyState(copied ? "copied" : "failed"),
                    );
                }}
              >
                {diagnosticsCopyState === "copied"
                  ? "Copied"
                  : diagnosticsCopyState === "failed"
                    ? "Copy failed"
                    : "Copy diagnostics"}
              </button>
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
              <div className="voice-device-error__actions">
                {voice.screenShareFailure?.canOpenSettings ? (
                  <button
                    type="button"
                    onClick={() =>
                      void openPermissionSettings("screen").catch(
                        () => undefined,
                      )
                    }
                  >
                    Open Privacy Settings
                  </button>
                ) : null}
                {voice.screenShareFailure?.restartRequired ? (
                  <button
                    type="button"
                    onClick={() => void restartDesktopApp()}
                  >
                    Restart Bakbak
                  </button>
                ) : null}
                {voice.screenShareFailure?.recommendedRetrySource ===
                "display" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void voice.retryScreenShareWithEntireScreen()
                    }
                  >
                    Retry Entire screen
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {focusedShare ? (
            <div className="voice-focus-layout">
              <ScreenShareStage
                share={focusedShare}
                settings={voice.screenShareSettings}
                settingsPending={voice.screenShareSettingsPending}
                onActivateMedia={returnToPeople}
                onUpdateSettings={(settings) =>
                  void voice.updateScreenShareSettings(settings)
                }
              />
            </div>
          ) : (
            <div
              className="voice-people-gallery"
              data-target-count={peopleCount}
              data-layout={peopleGalleryLayout(peopleCount)}
            >
              {voice.participants.map((participant) => {
                const share = screenShares.find(
                  (candidate) => candidate.ownerId === participant.id,
                );
                return (
                  <ParticipantOrb
                    key={`participant:${participant.id}`}
                    participant={participant}
                    share={share ?? null}
                    watchedShare={Boolean(
                      share &&
                      (share.isLocal ||
                        voice.watchedScreenShareId === share.id),
                    )}
                    members={members}
                    user={user}
                    voice={voice}
                    loadProfileMedia={loadProfileMedia}
                    onOpenProfile={onOpenProfile}
                    onOpenUserContextMenu={onOpenUserContextMenu}
                    openProfileId={openProfileId}
                    onFocusShare={() => {
                      if (share) {
                        focusShare(share);
                      }
                    }}
                  />
                );
              })}
              {orphanScreenShares.map((share) => (
                <OrphanShareOrb
                  key={`screen:${share.id}`}
                  share={share}
                  watched={
                    share.isLocal || voice.watchedScreenShareId === share.id
                  }
                  onFocus={() => focusShare(share)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function ParticipantOrb({
  participant,
  share,
  watchedShare,
  members,
  user,
  voice,
  loadProfileMedia,
  onOpenProfile,
  onOpenUserContextMenu,
  openProfileId,
  onFocusShare,
}: {
  participant: VoiceParticipant;
  share: VoiceScreenShare | null;
  watchedShare: boolean;
  members: ServerMember[];
  user: AppUser;
  voice: ReturnType<typeof useVoiceRoom>;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId: string | null;
  onFocusShare: () => void;
}) {
  const latestSound = participant.activeSounds.at(-1);
  const soundActive = participant.activeSounds.length > 0;
  const cameraActive = Boolean(
    participant.cameraEnabled && participant.cameraTrack,
  );
  const member = members.find((candidate) => candidate.id === participant.id);
  const displayName = member?.displayName ?? participant.displayName;
  const profileMember =
    member ?? (participant.isLocal ? { ...user, role: "member" } : null);
  const avatarUser =
    member ??
    (participant.isLocal
      ? user
      : {
          displayName,
          avatarUrl: null,
          status: "online" as const,
        });
  const activityLabel = soundActive
    ? participant.activeSounds.length > 1
      ? `${participant.activeSounds.length} sounds playing`
      : `Playing ${latestSound?.label ?? "sound"}`
    : participant.isSpeaking
      ? "Speaking"
      : participant.isMuted
        ? "Muted"
        : "Listening";
  const openContextMenuFromKeyboard = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (
      event.defaultPrevented ||
      !profileMember ||
      !onOpenUserContextMenu ||
      !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
    ) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenUserContextMenu(profileMember, event.currentTarget, {
      clientX: rect.left,
      clientY: rect.bottom,
    });
  };
  const media =
    cameraActive && participant.cameraTrack ? (
      <ParticipantVideo
        track={participant.cameraTrack}
        local={participant.isLocal}
        label={displayName}
      />
    ) : profileMember ? (
      <ParticipantAvatar
        member={profileMember}
        loadProfileMedia={loadProfileMedia}
      />
    ) : (
      <Avatar user={avatarUser} size="large" />
    );

  return (
    <article
      className={`voice-participant-orb ${participant.isSpeaking ? "is-speaking" : ""} ${share ? "is-live" : ""} ${soundActive ? "is-sound-active" : ""}`}
      tabIndex={0}
      aria-label={`${displayName}, ${activityLabel}${share ? ", live" : ""}`}
      onContextMenu={(event) => {
        if (
          event.defaultPrevented ||
          !profileMember ||
          !onOpenUserContextMenu
        ) {
          return;
        }
        event.preventDefault();
        onOpenUserContextMenu(profileMember, event.currentTarget, {
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }}
      onKeyDown={openContextMenuFromKeyboard}
    >
      <div className="voice-participant-orb__visual">
        <span className="voice-participant-orb__ring voice-participant-orb__ring--live" />
        <span className="voice-participant-orb__ring voice-participant-orb__ring--speaking" />
        {share ? (
          <button
            className="voice-participant-orb__media is-actionable"
            type="button"
            aria-label={`Watch ${displayName}'s live screen`}
            onClick={onFocusShare}
          >
            {media}
          </button>
        ) : (
          <span className="voice-participant-orb__media">{media}</span>
        )}
        {latestSound ? (
          <SoundEmoji
            key={latestSound.eventId}
            emoji={latestSound.emoji}
            label={`${displayName} is playing ${latestSound.label}`}
            count={participant.activeSounds.length}
            maximum={voice.maxConcurrentSounds}
            blend
          />
        ) : null}
        {share ? (
          <button
            className="voice-participant-orb__live"
            aria-label={`${displayName} is LIVE`}
            type="button"
            onClick={onFocusShare}
          >
            <Monitor size={11} aria-hidden="true" /> LIVE
          </button>
        ) : null}
      </div>
      <div
        className="voice-participant-orb__details"
        role="group"
        aria-label={`${displayName} controls`}
      >
        <span className="voice-participant-orb__summary">
          <strong>{displayName}</strong>
          <small>
            {participant.isMuted ? <MicOff size={13} /> : <Mic size={13} />}
            {activityLabel}
          </small>
        </span>
        <span className="voice-participant-orb__actions">
          {profileMember ? (
            <ProfileTrigger
              className="voice-participant-orb__action"
              member={profileMember}
              loadMedia={loadProfileMedia}
              onOpenProfile={onOpenProfile}
              onOpenContextMenu={onOpenUserContextMenu}
              expanded={openProfileId === profileMember.id}
              aria-label={`View ${displayName}'s profile`}
              data-tooltip="View profile"
            >
              {() => <UserRound size={15} aria-hidden="true" />}
            </ProfileTrigger>
          ) : null}
          {share ? (
            <button
              className="voice-participant-orb__action is-live"
              type="button"
              aria-label={`${share.isLocal || watchedShare ? "Focus" : "Watch"} ${displayName}'s screen share`}
              data-tooltip={
                share.isLocal || watchedShare ? "Open LIVE" : "Watch LIVE"
              }
              onClick={onFocusShare}
            >
              <Monitor size={15} aria-hidden="true" />
            </button>
          ) : null}
        </span>
        {!participant.isLocal ? (
          <label
            className="voice-participant-orb__volume"
            aria-label={`${displayName} volume`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Volume2 size={13} />
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={participant.volume}
              aria-valuetext={`${Math.round(participant.volume * 100)}%${participant.volume > 1 ? " boosted" : ""}`}
              title="Levels above 100% boost quiet participants and may also amplify background noise."
              onInput={(event) =>
                voice.setParticipantVolume(
                  participant.id,
                  Number(event.currentTarget.value),
                )
              }
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowLeft" || event.key === "ArrowDown"
                    ? -1
                    : event.key === "ArrowRight" || event.key === "ArrowUp"
                      ? 1
                      : 0;
                if (direction === 0) return;
                event.preventDefault();
                voice.setParticipantVolume(
                  participant.id,
                  Math.max(
                    0,
                    Math.min(2, participant.volume + direction * 0.05),
                  ),
                );
              }}
            />
            <output>{Math.round(participant.volume * 100)}%</output>
          </label>
        ) : null}
      </div>
    </article>
  );
}

function ParticipantAvatar({
  member,
  loadProfileMedia,
}: {
  member: ServerMember;
  loadProfileMedia: LoadProfileMedia;
}) {
  const reducedMotion = useReducedMotion();
  const [resolvedAnimationUrl, setResolvedAnimationUrl] = useState<
    string | null
  >(null);
  const { avatarAnimationPath, avatarAnimationUrl, avatarGiphyId } = member;

  useEffect(() => {
    setResolvedAnimationUrl(null);
    if (
      reducedMotion ||
      avatarAnimationUrl ||
      (!avatarAnimationPath && !avatarGiphyId)
    ) {
      return;
    }

    let current = true;
    const animation = avatarGiphyId
      ? resolveGiphyProfileMedia(
          { avatarGiphyId, coverGiphyId: null },
          { includeAvatarAnimation: true },
        ).then((media) => media.avatarAnimationUrl)
      : loadProfileMedia(AVATAR_BUCKET, avatarAnimationPath);
    void animation
      .then((url) => {
        if (current) setResolvedAnimationUrl(url);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [
    avatarAnimationPath,
    avatarAnimationUrl,
    avatarGiphyId,
    loadProfileMedia,
    reducedMotion,
  ]);

  return (
    <Avatar
      user={member}
      size="large"
      animationUrl={
        reducedMotion ? null : (avatarAnimationUrl ?? resolvedAnimationUrl)
      }
      animated={!reducedMotion}
    />
  );
}

function OrphanShareOrb({
  share,
  watched,
  onFocus,
}: {
  share: VoiceScreenShare;
  watched: boolean;
  onFocus: () => void;
}) {
  return (
    <article
      className="voice-participant-orb voice-participant-orb--orphan is-live"
      aria-label={`${share.displayName}, live screen share`}
    >
      <div className="voice-participant-orb__visual">
        <span className="voice-participant-orb__ring voice-participant-orb__ring--live" />
        <button
          className="voice-participant-orb__media"
          type="button"
          aria-label={`Open ${share.displayName}'s live screen`}
          onClick={onFocus}
        >
          <Avatar
            user={{
              displayName: share.displayName,
              avatarUrl: null,
              status: "online",
            }}
            size="large"
          />
        </button>
        <button
          className="voice-participant-orb__live"
          aria-label={`${share.displayName} is LIVE`}
          type="button"
          onClick={onFocus}
        >
          <Monitor size={11} aria-hidden="true" /> LIVE
        </button>
      </div>
      <div
        className="voice-participant-orb__details"
        role="group"
        aria-label={`${share.displayName} live controls`}
      >
        <span className="voice-participant-orb__summary">
          <strong>{share.displayName}</strong>
          <small>
            <Monitor size={13} /> Shared screen
          </small>
        </span>
        <span className="voice-participant-orb__actions">
          <button
            className="voice-participant-orb__action is-live"
            type="button"
            aria-label={`${share.isLocal || watched ? "Focus" : "Watch"} ${share.displayName}'s screen share`}
            data-tooltip={share.isLocal || watched ? "Open LIVE" : "Watch LIVE"}
            onClick={onFocus}
          >
            <Monitor size={15} aria-hidden="true" />
          </button>
        </span>
      </div>
    </article>
  );
}

function SoundEmoji({
  emoji,
  label,
  count,
  maximum,
  overlay = false,
  blend = false,
}: {
  emoji: string;
  label: string;
  count: number;
  maximum: number;
  overlay?: boolean;
  blend?: boolean;
}) {
  return (
    <span
      className={`participant-card__sound-emoji ${overlay ? "is-overlay" : "is-avatar"} ${blend ? "is-blended" : ""}`}
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

function peopleGalleryLayout(
  targetCount: number,
): "solo" | "cluster" | "wrap" | "dense" {
  if (targetCount <= 1) return "solo";
  if (targetCount <= 4) return "cluster";
  if (targetCount <= 10) return "wrap";
  return "dense";
}
