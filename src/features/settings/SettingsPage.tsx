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
import type { AppUser } from "../../lib/types";
import {
  validateAvatarFile,
  validateDisplayName,
} from "../../lib/profile-service";
import type {
  AccentColor,
  SurfaceStyle,
  ThemePreference,
} from "./appearance-preferences";

export type SettingsSection = "profile" | "audio" | "appearance";

export interface ProfileSaveInput {
  displayName: string;
  avatarFile: File | null;
  removeAvatar: boolean;
}

interface SettingsPageProps {
  user: AppUser;
  section: SettingsSection;
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
  onThemeChange: (preference: ThemePreference) => void;
  onAccentChange: (accent: AccentColor, intensity: number) => void;
  onSurfaceStyleChange: (surfaceStyle: SurfaceStyle) => void;
  onSaveProfile: (input: ProfileSaveInput) => Promise<{ warning?: string }>;
  onInputChange: (deviceId: string) => void;
  onOutputChange: (deviceId: string) => void;
  onCameraChange: (deviceId: string) => void;
  onSoundboardVolumeChange: (volume: number) => void;
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
        else onClose();
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
  }, [onClose]);

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
              <ProfileSettings user={props.user} onSave={props.onSaveProfile} />
            ) : null}
            {props.section === "audio" ? <AudioSettings {...props} /> : null}
            {props.section === "appearance" ? (
              <AppearanceSettings
                preference={props.themePreference}
                accent={props.accent}
                intensity={props.accentIntensity}
                surfaceStyle={props.surfaceStyle}
                onChange={props.onThemeChange}
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

function ProfileSettings({
  user,
  onSave,
}: {
  user: AppUser;
  onSave: SettingsPageProps["onSaveProfile"];
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setDisplayName(user.displayName), [user.displayName]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setError(null);
    try {
      validateAvatarFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setAvatarFile(file);
      setRemoveAvatar(false);
    } catch (caught) {
      event.target.value = "";
      setError(
        caught instanceof Error ? caught.message : "That image cannot be used.",
      );
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const normalized = validateDisplayName(displayName);
      const result = await onSave({
        displayName: normalized,
        avatarFile,
        removeAvatar,
      });
      setAvatarFile(null);
      setRemoveAvatar(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
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
    avatarUrl: removeAvatar ? null : (previewUrl ?? user.avatarUrl),
  };

  return (
    <form
      className="settings-panel profile-settings"
      onSubmit={(event) => void submit(event)}
    >
      <div className="settings-panel__heading">
        <span className="eyebrow">Profile</span>
        <h2>How friends see you</h2>
        <p>Your photo stays inside servers you share with friends.</p>
      </div>
      <div className="profile-photo-row">
        <Avatar user={avatarUser} size="large" />
        <div>
          <label className="secondary-button profile-upload">
            Choose photo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={chooseAvatar}
            />
          </label>
          {(user.avatarPath || user.avatarUrl || previewUrl) &&
          !removeAvatar ? (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setAvatarFile(null);
                setRemoveAvatar(true);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
              }}
            >
              Remove photo
            </button>
          ) : null}
          <span>PNG, JPEG, or WebP · up to 2 MiB</span>
        </div>
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
        <button className="primary-button" type="submit" disabled={saving}>
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
            Call audio and soundboard use this output. Message alerts keep using
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
  preference,
  accent,
  intensity,
  surfaceStyle,
  onChange,
  onAccentChange,
  onSurfaceStyleChange,
}: {
  preference: ThemePreference;
  accent: AccentColor;
  intensity: number;
  surfaceStyle: SurfaceStyle;
  onChange: (preference: ThemePreference) => void;
  onAccentChange: (accent: AccentColor, intensity: number) => void;
  onSurfaceStyleChange: (surfaceStyle: SurfaceStyle) => void;
}) {
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
      <div className="theme-options" role="radiogroup" aria-label="App theme">
        {options.map((option) => (
          <button
            className={preference === option.value ? "is-active" : ""}
            type="button"
            role="radio"
            aria-checked={preference === option.value}
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
            onChange={(event) =>
              onAccentChange(accent, Number(event.target.value))
            }
          />
          <small>Subtle</small>
          <small>Vivid</small>
        </label>
      </section>
      <div className="theme-preview" aria-hidden="true">
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
