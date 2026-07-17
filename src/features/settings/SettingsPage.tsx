import {
  Camera,
  Check,
  Headphones,
  Laptop,
  LogOut,
  Mic,
  MicOff,
  Mic2,
  Moon,
  Palette,
  Play,
  RadioTower,
  Square,
  Sun,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Avatar } from "../../components/Avatar";
import type { LoadProfileMedia } from "../../components/ProfileTrigger";
import type { AppUser } from "../../lib/types";
import {
  AVATAR_BUCKET,
  COVER_BUCKET,
  MAX_DESCRIPTION_LENGTH,
  prepareProfileImage,
  validateAvatarFile,
  validateCoverFile,
  validateCoverPosition,
  validateDescription,
  validateDisplayName,
  type ProfileMediaKind,
} from "../../lib/profile-service";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import type {
  AccentColor,
  SurfaceStyle,
  ThemePreference,
  VisualPreset,
} from "./appearance-preferences";
import type {
  InterfaceSoundCategory,
  InterfaceSoundPreferences,
} from "./interface-sound-preferences";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);

export type SettingsSection = "profile" | "audio" | "appearance";

export interface ProfileSaveInput {
  displayName: string;
  description: string;
  avatarFile: File | null;
  coverFile: File | null;
  removeAvatar: boolean;
  removeCover: boolean;
  coverPositionX: number;
  coverPositionY: number;
}

interface SettingsPageProps {
  user: AppUser;
  section: SettingsSection;
  visualPreset: VisualPreset;
  themePreference: ThemePreference;
  accent: AccentColor;
  accentIntensity: number;
  surfaceStyle: SurfaceStyle;
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  cameraDevices: MediaDeviceInfo[];
  selectedInputId: string;
  selectedOutputId: string;
  selectedCameraId: string;
  soundboardVolume: number;
  interfaceSoundPreferences: InterfaceSoundPreferences;
  inputError: string | null;
  outputError: string | null;
  cameraError: string | null;
  inputDisabled: boolean;
  outputSelectionSupported: boolean;
  voiceStatus: string;
  voiceChannelName: string | null;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  onSectionChange: (section: SettingsSection) => void;
  onVisualPresetChange: (preset: VisualPreset) => void;
  onThemeChange: (preference: ThemePreference) => void;
  onAccentChange: (accent: AccentColor, intensity: number) => void;
  onSurfaceStyleChange: (surfaceStyle: SurfaceStyle) => void;
  onSaveProfile: (input: ProfileSaveInput) => Promise<{ warning?: string }>;
  loadProfileMedia?: LoadProfileMedia;
  onInputChange: (deviceId: string) => void;
  onOutputChange: (deviceId: string) => void;
  onCameraChange: (deviceId: string) => void;
  onSoundboardVolumeChange: (volume: number) => void;
  onInterfaceSoundPreferencesChange: (
    preferences: InterfaceSoundPreferences,
  ) => void;
  onPreviewInterfaceSound: (category: InterfaceSoundCategory) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeaveVoice: () => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const { onClose } = props;
  const dialogRef = useRef<HTMLElement>(null);
  const signOutDialogRef = useRef<HTMLElement>(null);
  const staySignedInRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const confirmingRef = useRef(confirmingSignOut);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    confirmingRef.current = confirmingSignOut;
    if (confirmingSignOut) staySignedInRef.current?.focus();
  }, [confirmingSignOut]);

  useEffect(() => {
    const returnFocusTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmingRef.current) setConfirmingSignOut(false);
        else onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusScope = signOutDialogRef.current ?? dialogRef.current;
      const focusable = focusScope.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusTo?.focus();
    };
  }, []);

  async function confirmSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await props.onSignOut();
    } catch (caught) {
      setSignOutError(
        caught instanceof Error ? caught.message : "Sign out failed.",
      );
      setSigningOut(false);
    }
  }

  return (
    <div
      className="settings-page-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !confirmingSignOut) {
          props.onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="settings-page"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-page__header">
          <div>
            <span className="eyebrow">Your corner</span>
            <h1 id="settings-title">Settings</h1>
            <p>Make Bakbak feel, sound, and look like your place.</p>
          </div>
          <button
            ref={closeRef}
            className="settings-close"
            type="button"
            onClick={props.onClose}
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </header>

        <div className="settings-page__body">
          <nav className="settings-nav" aria-label="Settings sections">
            <SettingsNavButton
              active={props.section === "profile"}
              icon={<UserRound size={17} />}
              label="Profile"
              onClick={() => props.onSectionChange("profile")}
            />
            <SettingsNavButton
              active={props.section === "audio"}
              icon={<Headphones size={17} />}
              label="Audio & video"
              onClick={() => props.onSectionChange("audio")}
            />
            <SettingsNavButton
              active={props.section === "appearance"}
              icon={<Palette size={17} />}
              label="Appearance"
              onClick={() => props.onSectionChange("appearance")}
            />
            <div className="settings-nav__spacer" />
            {props.voiceStatus !== "disconnected" ? (
              <div className="settings-call-strip">
                <span>Connected to</span>
                <strong>{props.voiceChannelName ?? "Voice room"}</strong>
                <div>
                  <button
                    type="button"
                    aria-label={props.voiceMuted ? "Unmute" : "Mute"}
                    onClick={props.onToggleMute}
                  >
                    {props.voiceMuted ? (
                      <MicOff size={15} />
                    ) : (
                      <Mic size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={props.voiceDeafened ? "Undeafen" : "Deafen"}
                    onClick={props.onToggleDeafen}
                  >
                    {props.voiceDeafened ? (
                      <VolumeX size={15} />
                    ) : (
                      <Volume2 size={15} />
                    )}
                  </button>
                  <button
                    className="is-danger"
                    type="button"
                    aria-label="Leave voice"
                    onClick={props.onLeaveVoice}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ) : null}
            <button
              className="settings-logout"
              type="button"
              onClick={() => {
                setSignOutError(null);
                setConfirmingSignOut(true);
              }}
            >
              <LogOut size={17} /> Log out
            </button>
          </nav>

          <div className="settings-canvas">
            {props.section === "profile" ? (
              <ProfileSettings
                user={props.user}
                onSave={props.onSaveProfile}
                loadMedia={props.loadProfileMedia ?? emptyProfileMediaLoader}
              />
            ) : null}
            {props.section === "audio" ? <AudioSettings {...props} /> : null}
            {props.section === "appearance" ? (
              <AppearanceSettings
                visualPreset={props.visualPreset}
                preference={props.themePreference}
                accent={props.accent}
                intensity={props.accentIntensity}
                surfaceStyle={props.surfaceStyle}
                onChange={props.onThemeChange}
                onVisualPresetChange={props.onVisualPresetChange}
                onAccentChange={props.onAccentChange}
                onSurfaceStyleChange={props.onSurfaceStyleChange}
              />
            ) : null}
          </div>
        </div>
        {confirmingSignOut ? (
          <div className="settings-confirm-backdrop" role="presentation">
            <section
              ref={signOutDialogRef}
              className="settings-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="sign-out-title"
            >
              <span className="eyebrow">One last click</span>
              <h2 id="sign-out-title">Log out of Bakbak?</h2>
              <p>
                {props.voiceStatus !== "disconnected"
                  ? "This will also leave your active voice room."
                  : "Your local appearance and device choices will stay on this computer."}
              </p>
              {signOutError ? (
                <p className="settings-error" role="alert">
                  {signOutError}
                </p>
              ) : null}
              <div>
                <button
                  ref={staySignedInRef}
                  className="secondary-button"
                  type="button"
                  disabled={signingOut}
                  onClick={() => setConfirmingSignOut(false)}
                >
                  Stay signed in
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={signingOut}
                  onClick={() => void confirmSignOut()}
                >
                  <LogOut size={16} /> {signingOut ? "Logging out…" : "Log out"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SettingsNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "is-active" : ""}
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function useObjectUrlCleanup(url: string | null) {
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
}

function ProfileSettings({
  user,
  onSave,
  loadMedia,
}: {
  user: AppUser;
  onSave: SettingsPageProps["onSaveProfile"];
  loadMedia: LoadProfileMedia;
}) {
  const reducedMotion = useReducedMotion();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [description, setDescription] = useState(user.description);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeCover, setRemoveCover] = useState(false);
  const [coverPositionX, setCoverPositionX] = useState(user.coverPositionX);
  const [coverPositionY, setCoverPositionY] = useState(user.coverPositionY);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarAnimationPreviewUrl, setAvatarAnimationPreviewUrl] = useState<
    string | null
  >(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverAnimationPreviewUrl, setCoverAnimationPreviewUrl] = useState<
    string | null
  >(null);
  const [currentAvatarAnimationUrl, setCurrentAvatarAnimationUrl] = useState<
    string | null
  >(user.avatarAnimationUrl);
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | null>(
    user.coverUrl,
  );
  const [currentCoverAnimationUrl, setCurrentCoverAnimationUrl] = useState<
    string | null
  >(user.coverAnimationUrl);
  const [preparingMedia, setPreparingMedia] = useState<ProfileMediaKind | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mediaRequestRef = useRef(0);

  useEffect(() => setDisplayName(user.displayName), [user.displayName]);
  useEffect(() => setDescription(user.description), [user.description]);
  useEffect(() => {
    setCoverPositionX(user.coverPositionX);
    setCoverPositionY(user.coverPositionY);
  }, [user.coverPositionX, user.coverPositionY]);

  useObjectUrlCleanup(avatarPreviewUrl);
  useObjectUrlCleanup(avatarAnimationPreviewUrl);
  useObjectUrlCleanup(coverPreviewUrl);
  useObjectUrlCleanup(coverAnimationPreviewUrl);

  useEffect(
    () => () => {
      mediaRequestRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    let current = true;
    setCurrentAvatarAnimationUrl(user.avatarAnimationUrl);
    setCurrentCoverUrl(user.coverUrl);
    setCurrentCoverAnimationUrl(user.coverAnimationUrl);
    void Promise.all([
      !reducedMotion && !user.avatarAnimationUrl
        ? loadMedia(AVATAR_BUCKET, user.avatarAnimationPath)
        : Promise.resolve(user.avatarAnimationUrl),
      !user.coverUrl
        ? loadMedia(COVER_BUCKET, user.coverPath)
        : Promise.resolve(user.coverUrl),
      !reducedMotion && !user.coverAnimationUrl
        ? loadMedia(COVER_BUCKET, user.coverAnimationPath)
        : Promise.resolve(user.coverAnimationUrl),
    ])
      .then(([avatarAnimation, cover, coverAnimation]) => {
        if (!current) return;
        setCurrentAvatarAnimationUrl(avatarAnimation);
        setCurrentCoverUrl(cover);
        setCurrentCoverAnimationUrl(coverAnimation);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [
    loadMedia,
    reducedMotion,
    user.avatarAnimationPath,
    user.avatarAnimationUrl,
    user.coverAnimationPath,
    user.coverAnimationUrl,
    user.coverPath,
    user.coverUrl,
  ]);

  async function chooseImage(
    event: ChangeEvent<HTMLInputElement>,
    kind: ProfileMediaKind,
  ) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const request = ++mediaRequestRef.current;
    setError(null);
    setNotice(null);
    setPreparingMedia(kind);
    try {
      if (kind === "avatar") validateAvatarFile(file);
      else validateCoverFile(file);
      const prepared = await prepareProfileImage(file, kind);
      if (request !== mediaRequestRef.current) return;
      const posterUrl = URL.createObjectURL(prepared.poster);
      const animationUrl = prepared.animation
        ? URL.createObjectURL(prepared.animation)
        : null;
      if (kind === "avatar") {
        setAvatarPreviewUrl(posterUrl);
        setAvatarAnimationPreviewUrl(animationUrl);
        setAvatarFile(file);
        setRemoveAvatar(false);
      } else {
        setCoverPreviewUrl(posterUrl);
        setCoverAnimationPreviewUrl(animationUrl);
        setCoverFile(file);
        setRemoveCover(false);
        setCoverPositionX(50);
        setCoverPositionY(50);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That image cannot be used.",
      );
    } finally {
      if (request === mediaRequestRef.current) setPreparingMedia(null);
      event.target.value = "";
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const normalized = validateDisplayName(displayName);
      const normalizedDescription = validateDescription(description);
      const result = await onSave({
        displayName: normalized,
        description: normalizedDescription,
        avatarFile,
        coverFile,
        removeAvatar,
        removeCover,
        coverPositionX: validateCoverPosition(coverPositionX),
        coverPositionY: validateCoverPosition(coverPositionY),
      });
      setAvatarFile(null);
      setCoverFile(null);
      setRemoveAvatar(false);
      setRemoveCover(false);
      setAvatarPreviewUrl(null);
      setAvatarAnimationPreviewUrl(null);
      setCoverPreviewUrl(null);
      setCoverAnimationPreviewUrl(null);
      setNotice(
        result.warning ?? "Profile saved. Looking unmistakably like you.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Your profile did not save.",
      );
    } finally {
      setSaving(false);
    }
  }

  const avatarUser = {
    ...user,
    displayName: displayName.trim() || user.displayName,
    avatarUrl: removeAvatar
      ? null
      : avatarFile
        ? avatarPreviewUrl
        : user.avatarUrl,
  };
  const avatarAnimationUrl = reducedMotion
    ? null
    : avatarFile
      ? avatarAnimationPreviewUrl
      : currentAvatarAnimationUrl;
  const coverUrl = removeCover
    ? null
    : coverFile
      ? coverPreviewUrl
      : currentCoverUrl;
  const coverAnimationUrl = reducedMotion
    ? null
    : coverFile
      ? coverAnimationPreviewUrl
      : currentCoverAnimationUrl;
  const dirty =
    displayName !== user.displayName ||
    description !== user.description ||
    avatarFile !== null ||
    coverFile !== null ||
    removeAvatar ||
    removeCover ||
    coverPositionX !== user.coverPositionX ||
    coverPositionY !== user.coverPositionY;

  function updateFocalPoint(
    clientX: number,
    clientY: number,
    element: Element,
  ) {
    const bounds = element.getBoundingClientRect();
    setCoverPositionX(
      Math.round(
        Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) * 100,
      ),
    );
    setCoverPositionY(
      Math.round(
        Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)) * 100,
      ),
    );
  }

  return (
    <form
      className="settings-panel profile-settings"
      onSubmit={(event) => void submit(event)}
    >
      <div className="settings-panel__heading">
        <span className="eyebrow">Profile</span>
        <h2>How friends see you</h2>
        <p>Your profile stays inside servers you share with friends.</p>
      </div>
      <section className="profile-editor-preview" aria-label="Profile preview">
        <div className="profile-editor-preview__media">
          <div
            className={`profile-editor-preview__cover ${coverUrl ? "has-media" : ""}`}
            tabIndex={coverUrl ? 0 : undefined}
            aria-label={
              coverUrl
                ? `Cover focal point, ${coverPositionX}% horizontal, ${coverPositionY}% vertical`
                : undefined
            }
            onPointerDown={(event) => {
              if (!coverUrl) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFocalPoint(
                event.clientX,
                event.clientY,
                event.currentTarget,
              );
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              updateFocalPoint(
                event.clientX,
                event.clientY,
                event.currentTarget,
              );
            }}
            onKeyDown={(event) => {
              if (!coverUrl) return;
              const step = event.shiftKey ? 10 : 2;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setCoverPositionX((value) => Math.max(0, value - step));
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setCoverPositionX((value) => Math.min(100, value + step));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCoverPositionY((value) => Math.max(0, value - step));
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setCoverPositionY((value) => Math.min(100, value + step));
              }
            }}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                style={{
                  objectPosition: `${coverPositionX}% ${coverPositionY}%`,
                }}
              />
            ) : null}
            {coverAnimationUrl ? (
              <img
                className="profile-editor-preview__cover-animation"
                src={coverAnimationUrl}
                alt=""
                style={{
                  objectPosition: `${coverPositionX}% ${coverPositionY}%`,
                }}
              />
            ) : null}
            {coverUrl ? <span>Drag to frame your cover</span> : null}
          </div>
          <div className="profile-editor-preview__avatar">
            <Avatar
              user={avatarUser}
              size="large"
              animationUrl={avatarAnimationUrl}
              animated={!reducedMotion}
            />
          </div>
        </div>
        <div className="profile-editor-preview__copy">
          <strong>{displayName.trim() || "Your name"}</strong>
          <p>
            {description.trim() ||
              "Your description will make this corner feel like yours."}
          </p>
        </div>
      </section>
      <div className="profile-media-editors">
        <section>
          <strong>Avatar</strong>
          <div>
            <label className="secondary-button profile-upload">
              {preparingMedia === "avatar" ? "Preparing…" : "Choose avatar"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={preparingMedia !== null || saving}
                onChange={(event) => void chooseImage(event, "avatar")}
              />
            </label>
            {(user.avatarPath || user.avatarUrl || avatarPreviewUrl) &&
            !removeAvatar ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setAvatarFile(null);
                  setRemoveAvatar(true);
                  setAvatarPreviewUrl(null);
                  setAvatarAnimationPreviewUrl(null);
                }}
              >
                Remove avatar
              </button>
            ) : null}
          </div>
          <span>PNG, JPEG, WebP, or GIF · up to 5 MiB</span>
        </section>
        <section>
          <strong>Cover</strong>
          <div>
            <label className="secondary-button profile-upload">
              {preparingMedia === "cover" ? "Preparing…" : "Choose cover"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={preparingMedia !== null || saving}
                onChange={(event) => void chooseImage(event, "cover")}
              />
            </label>
            {(user.coverPath || user.coverUrl || coverPreviewUrl) &&
            !removeCover ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setCoverFile(null);
                  setRemoveCover(true);
                  setCoverPreviewUrl(null);
                  setCoverAnimationPreviewUrl(null);
                  setCoverPositionX(50);
                  setCoverPositionY(50);
                }}
              >
                Remove cover
              </button>
            ) : null}
            {coverUrl ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setCoverPositionX(50);
                  setCoverPositionY(50);
                }}
              >
                Center cover
              </button>
            ) : null}
          </div>
          <span>PNG, JPEG, WebP, or GIF · up to 10 MiB</span>
        </section>
      </div>
      <div className="settings-field">
        <label htmlFor="profile-display-name">Display name</label>
        <input
          id="profile-display-name"
          aria-describedby="profile-display-name-help"
          value={displayName}
          minLength={1}
          maxLength={50}
          required
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <small id="profile-display-name-help">
          This does not need to be unique. Friendship survived duplicate names
          before databases.
        </small>
      </div>
      <div className="settings-field">
        <label htmlFor="profile-description">
          Description{" "}
          <span>
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </label>
        <textarea
          id="profile-description"
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          rows={4}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A tiny introduction, an excellent in-joke, or both."
        />
        <small>Plain text, emoji, and line breaks. No public links.</small>
      </div>
      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="settings-success" role="status">
          {notice}
        </p>
      ) : null}
      <div className="settings-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={saving || preparingMedia !== null || !dirty}
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

function AudioSettings(props: SettingsPageProps) {
  const [meter, setMeter] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const stopTestRef = useRef<(() => void) | null>(null);
  const stopOutputTestRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const testRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      testRequestRef.current += 1;
      stopTestRef.current?.();
      stopOutputTestRef.current?.();
    };
  }, []);

  async function toggleMicTest() {
    if (testing) {
      testRequestRef.current += 1;
      if (stopTestRef.current) stopTestRef.current();
      else setTesting(false);
      return;
    }
    const requestId = ++testRequestRef.current;
    setTestError(null);
    setTesting(true);
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(props.selectedInputId === "default"
            ? {}
            : { deviceId: { exact: props.selectedInputId } }),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current || requestId !== testRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      const tick = () => {
        analyser.getByteFrequencyData(values);
        const average =
          values.reduce((sum, value) => sum + value, 0) / values.length;
        setMeter(Math.min(1, average / 90));
        frame = requestAnimationFrame(tick);
      };
      const stop = () => {
        cancelAnimationFrame(frame);
        stream?.getTracks().forEach((track) => track.stop());
        void context?.close();
        if (mountedRef.current) {
          setMeter(0);
          setTesting(false);
        }
        stopTestRef.current = null;
      };
      stopTestRef.current = stop;
      tick();
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      stopTestRef.current = null;
      if (mountedRef.current && requestId === testRequestRef.current) {
        setTesting(false);
        setTestError(
          caught instanceof Error
            ? caught.message
            : "Microphone test could not start.",
        );
      }
    }
  }

  async function testOutput() {
    setTestError(null);
    stopOutputTestRef.current?.();
    let context: AudioContext | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    let audio: HTMLAudioElement | null = null;
    let cleanup: (() => void) | null = null;
    try {
      context = new AudioContext();
      destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.08;
      oscillator.frequency.value = 523.25;
      oscillator.connect(gain).connect(destination);
      audio = new Audio();
      audio.srcObject = destination.stream;
      let cleaned = false;
      cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        audio?.pause();
        if (audio) audio.srcObject = null;
        destination?.stream.getTracks().forEach((track) => track.stop());
        void context?.close();
        if (stopOutputTestRef.current === cleanup) {
          stopOutputTestRef.current = null;
        }
      };
      stopOutputTestRef.current = cleanup;
      oscillator.addEventListener("ended", cleanup, { once: true });
      if (props.selectedOutputId !== "default" && "setSinkId" in audio) {
        await (
          audio as HTMLAudioElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        ).setSinkId(props.selectedOutputId);
      }
      if (!mountedRef.current) {
        cleanup();
        return;
      }
      oscillator.start();
      oscillator.stop(context.currentTime + 0.22);
      await audio.play();
    } catch (caught) {
      if (cleanup) cleanup();
      else {
        audio?.pause();
        if (audio) audio.srcObject = null;
        destination?.stream.getTracks().forEach((track) => track.stop());
        void context?.close();
      }
      stopOutputTestRef.current = null;
      if (mountedRef.current) {
        setTestError(
          caught instanceof Error
            ? caught.message
            : "Output test could not play.",
        );
      }
    }
  }

  return (
    <div className="settings-panel audio-settings">
      <div className="settings-panel__heading">
        <span className="eyebrow">Audio & video</span>
        <h2>Sound check, minus the awkward tapping</h2>
        <p>
          Nothing asks for microphone access until you start the test or join a
          room.
        </p>
      </div>
      <section
        className="interface-sound-settings"
        aria-labelledby="interface-sounds-title"
      >
        <div className="interface-sound-settings__heading">
          <div>
            <span className="eyebrow">Every visual theme</span>
            <h3 id="interface-sounds-title">Interface sounds</h3>
            <p>
              Original industrial-digital cues play through the system output,
              separately from call audio.
            </p>
          </div>
          <button
            className="interface-sound-master"
            type="button"
            role="switch"
            aria-checked={props.interfaceSoundPreferences.enabled}
            onClick={() =>
              props.onInterfaceSoundPreferencesChange({
                ...props.interfaceSoundPreferences,
                enabled: !props.interfaceSoundPreferences.enabled,
              })
            }
          >
            {props.interfaceSoundPreferences.enabled ? (
              <Volume2 size={17} />
            ) : (
              <VolumeX size={17} />
            )}
            {props.interfaceSoundPreferences.enabled ? "On" : "Muted"}
          </button>
        </div>
        <label className="interface-sound-volume">
          <span>
            Master volume —{" "}
            {Math.round(props.interfaceSoundPreferences.volume * 100)}%
          </span>
          <input
            aria-label="Interface sound volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={props.interfaceSoundPreferences.volume}
            disabled={!props.interfaceSoundPreferences.enabled}
            onChange={(event) =>
              props.onInterfaceSoundPreferencesChange({
                ...props.interfaceSoundPreferences,
                volume: Number(event.target.value),
              })
            }
          />
        </label>
        <div className="interface-sound-categories">
          {(
            [
              ["messages", "Messages"],
              ["voice", "Voice"],
              ["screen-share", "Screen share"],
              ["status", "Status"],
            ] as const satisfies ReadonlyArray<
              readonly [InterfaceSoundCategory, string]
            >
          ).map(([category, label]) => (
            <div key={category}>
              <button
                className="interface-sound-category"
                type="button"
                role="switch"
                aria-checked={
                  props.interfaceSoundPreferences.categories[category]
                }
                onClick={() =>
                  props.onInterfaceSoundPreferencesChange({
                    ...props.interfaceSoundPreferences,
                    categories: {
                      ...props.interfaceSoundPreferences.categories,
                      [category]:
                        !props.interfaceSoundPreferences.categories[category],
                    },
                  })
                }
              >
                <span>{label}</span>
                <i aria-hidden="true" />
              </button>
              <button
                className="interface-sound-preview"
                type="button"
                aria-label={`Preview ${label} sound`}
                disabled={
                  !props.interfaceSoundPreferences.enabled ||
                  !props.interfaceSoundPreferences.categories[category]
                }
                onClick={() => props.onPreviewInterfaceSound(category)}
              >
                <Play size={13} /> Preview
              </button>
            </div>
          ))}
        </div>
      </section>
      <div className="settings-two-column">
        <section>
          <h3>
            <Mic2 size={18} /> Microphone
          </h3>
          <DeviceSelect
            label="Input device"
            devices={props.inputDevices}
            selectedId={props.selectedInputId}
            fallbackLabel="Microphone"
            disabled={props.inputDisabled}
            onChange={props.onInputChange}
          />
          <div className="microphone-test">
            <div aria-label="Microphone input level">
              <i style={{ width: `${meter * 100}%` }} />
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void toggleMicTest()}
            >
              {testing ? <Square size={14} /> : <Play size={14} />}
              {testing ? "Stop test" : "Test microphone"}
            </button>
          </div>
          {props.inputError ? (
            <p className="settings-error">{props.inputError}</p>
          ) : null}
        </section>
        <section>
          <h3>
            <Headphones size={18} /> Output
          </h3>
          <DeviceSelect
            label="Speaker"
            devices={props.outputDevices}
            selectedId={props.selectedOutputId}
            fallbackLabel="Speaker"
            disabled={props.inputDisabled || !props.outputSelectionSupported}
            onChange={props.onOutputChange}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => void testOutput()}
          >
            <Play size={14} /> Test output
          </button>
          {!props.outputSelectionSupported ? (
            <p className="settings-note">
              This runtime uses the system output.
            </p>
          ) : null}
          {props.outputError ? (
            <p className="settings-error">{props.outputError}</p>
          ) : null}
        </section>
        <section>
          <h3>
            <Camera size={18} /> Camera
          </h3>
          <DeviceSelect
            label="Video device"
            devices={props.cameraDevices}
            selectedId={props.selectedCameraId}
            fallbackLabel="Camera"
            disabled={props.inputDisabled}
            onChange={props.onCameraChange}
          />
          <p className="settings-note">
            Camera stays off until you turn it on in a voice room.
          </p>
          {props.cameraError ? (
            <p className="settings-error">{props.cameraError}</p>
          ) : null}
        </section>
        <section>
          <h3>
            <Laptop size={18} /> Soundboard
          </h3>
          <label className="settings-field">
            <span>
              Local volume — {Math.round(props.soundboardVolume * 100)}%
            </span>
            <input
              aria-label="Soundboard volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={props.soundboardVolume}
              onChange={(event) =>
                props.onSoundboardVolumeChange(Number(event.target.value))
              }
            />
          </label>
          <p className="settings-note">
            Call audio and soundboard use this output. Interface cues keep using
            the system output.
          </p>
        </section>
      </div>
      {testError ? (
        <p className="settings-error" role="alert">
          {testError}
        </p>
      ) : null}
    </div>
  );
}

function DeviceSelect({
  label,
  devices,
  selectedId,
  fallbackLabel,
  disabled,
  onChange,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  selectedId: string;
  fallbackLabel: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select
        value={selectedId}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="default">System default</option>
        {devices
          .filter((device) => device.deviceId !== "default")
          .map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `${fallbackLabel} ${index + 1}`}
            </option>
          ))}
      </select>
    </label>
  );
}

function AppearanceSettings({
  visualPreset,
  preference,
  accent,
  intensity,
  surfaceStyle,
  onChange,
  onVisualPresetChange,
  onAccentChange,
  onSurfaceStyleChange,
}: {
  visualPreset: VisualPreset;
  preference: ThemePreference;
  accent: AccentColor;
  intensity: number;
  surfaceStyle: SurfaceStyle;
  onChange: (preference: ThemePreference) => void;
  onVisualPresetChange: (preset: VisualPreset) => void;
  onAccentChange: (accent: AccentColor, intensity: number) => void;
  onSurfaceStyleChange: (surfaceStyle: SurfaceStyle) => void;
}) {
  const signalRedActive = visualPreset === "signal-red";
  const options: Array<{
    value: ThemePreference;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      value: "system",
      label: "System",
      description: "Follow this computer",
      icon: <Laptop size={20} />,
    },
    {
      value: "light",
      label: "Light",
      description: "Oat, paper, and daylight",
      icon: <Sun size={20} />,
    },
    {
      value: "dark",
      label: "Dark",
      description: "Charcoal after-hours",
      icon: <Moon size={20} />,
    },
  ];
  return (
    <div className="settings-panel appearance-settings">
      <div className="settings-panel__heading">
        <span className="eyebrow">Appearance</span>
        <h2>Pick the light in the room</h2>
        <p>Your choice stays on this device and never becomes server gossip.</p>
      </div>
      <section
        className={`special-theme-card ${signalRedActive ? "is-active" : ""}`}
        aria-labelledby="special-theme-title"
      >
        <div className="special-theme-card__mark" aria-hidden="true">
          <RadioTower size={26} />
          <span>BK // 01</span>
        </div>
        <div className="special-theme-card__copy">
          <span className="eyebrow">Special theme</span>
          <h3 id="special-theme-title">Signal Red</h3>
          <p>
            A fixed black-and-red broadcast skin with sharp type, signal
            texture, and restrained edge animations.
          </p>
        </div>
        <button
          className={signalRedActive ? "secondary-button" : "primary-button"}
          type="button"
          aria-pressed={signalRedActive}
          onClick={() =>
            onVisualPresetChange(signalRedActive ? "standard" : "signal-red")
          }
        >
          {signalRedActive ? "Use standard" : "Activate Signal Red"}
        </button>
      </section>
      {signalRedActive ? (
        <p className="special-theme-note" role="status">
          Signal Red temporarily locks Dark, Flat, and its signature red.
          Disable it to restore these standard appearance choices exactly as you
          left them.
        </p>
      ) : null}
      <div className="theme-options" role="radiogroup" aria-label="App theme">
        {options.map((option) => (
          <button
            className={preference === option.value ? "is-active" : ""}
            type="button"
            role="radio"
            aria-checked={preference === option.value}
            disabled={signalRedActive}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.icon}</span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
            {preference === option.value ? <Check size={16} /> : null}
          </button>
        ))}
      </div>
      <section className="surface-settings" aria-labelledby="surface-title">
        <div>
          <h3 id="surface-title">Surface style</h3>
          <p>Keep the warmth, or make every surface calm and flat.</p>
        </div>
        <div
          className="surface-options"
          role="radiogroup"
          aria-label="Surface style"
        >
          <button
            className={surfaceStyle === "warm" ? "is-active" : ""}
            type="button"
            role="radio"
            aria-checked={surfaceStyle === "warm"}
            disabled={signalRedActive}
            onClick={() => onSurfaceStyleChange("warm")}
          >
            <span>Warm</span>
            <small>Gradients, depth, and soft light</small>
            {surfaceStyle === "warm" ? <Check size={15} /> : null}
          </button>
          <button
            className={surfaceStyle === "flat" ? "is-active" : ""}
            type="button"
            role="radio"
            aria-checked={surfaceStyle === "flat"}
            disabled={signalRedActive}
            onClick={() => onSurfaceStyleChange("flat")}
          >
            <span>Flat</span>
            <small>Plain grayscale surfaces, no glow</small>
            {surfaceStyle === "flat" ? <Check size={15} /> : null}
          </button>
        </div>
      </section>
      <section className="accent-settings" aria-labelledby="accent-title">
        <div>
          <h3 id="accent-title">Accent colour</h3>
          <p>One accent adapts itself to both Light and Dark.</p>
        </div>
        <div
          className="accent-options"
          role="radiogroup"
          aria-label="Accent colour"
        >
          {(
            [
              "coral",
              "purple",
              "red",
              "yellow",
            ] as const satisfies readonly AccentColor[]
          ).map((option) => (
            <button
              className={accent === option ? "is-active" : ""}
              type="button"
              role="radio"
              aria-checked={accent === option}
              disabled={signalRedActive}
              data-accent-option={option}
              key={option}
              onClick={() => onAccentChange(option, intensity)}
            >
              <i />
              <span>{option}</span>
              {accent === option ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
        <label className="accent-intensity">
          <span>Accent intensity</span>
          <strong>{intensity}%</strong>
          <input
            type="range"
            min="25"
            max="100"
            step="5"
            value={intensity}
            disabled={signalRedActive}
            onChange={(event) =>
              onAccentChange(accent, Number(event.target.value))
            }
          />
          <small>Subtle</small>
          <small>Vivid</small>
        </label>
      </section>
      <div
        className={`theme-preview ${signalRedActive ? "is-signal-red" : ""}`}
        aria-hidden="true"
      >
        <div className="theme-preview__shelf">
          <i />
          <i />
          <i />
        </div>
        <div className="theme-preview__conversation">
          <span />
          <span />
          <span />
        </div>
        <div className="theme-preview__tray">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
