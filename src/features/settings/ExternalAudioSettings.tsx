import { ExternalLink, Headphones, Mic2, Radio, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import type {
  ExternalAudioCableKind,
  ExternalAudioDeviceSnapshot,
  ExternalAudioLevels,
  ExternalAudioSessionConfig,
  ExternalAudioSessionState,
  ExternalAudioSetupRecordingStatus,
  ExternalAudioSetupTestConfig,
} from "../../lib/external-audio-types";

interface ExternalAudioSettingsProps {
  platform: "macos" | "windows" | null;
  devices: ExternalAudioDeviceSnapshot | null;
  state: ExternalAudioSessionState;
  levels: ExternalAudioLevels;
  loading: boolean;
  error: string | null;
  setupRecordingStatus: ExternalAudioSetupRecordingStatus;
  voiceConnected: boolean;
  onRefresh: () => Promise<void>;
  onStartSetupTest: (config: ExternalAudioSetupTestConfig) => Promise<void>;
  onPlaySetupTone: () => Promise<void>;
  onRecordSetupSample: () => Promise<void>;
  onPlaySetupRecording: () => Promise<void>;
  onStopSetupTest: () => Promise<void>;
  onLeaveVoice: () => Promise<void>;
  onStart: (config: ExternalAudioSessionConfig) => Promise<void>;
  onUpdate: (input: {
    microphoneMuted?: boolean;
    microphoneGain?: number;
    soundboardGain?: number;
  }) => Promise<void>;
  onStop: () => Promise<void>;
  onShowOverlay: () => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
}

export function ExternalAudioSettings({
  platform,
  devices,
  state,
  levels,
  loading,
  error,
  setupRecordingStatus,
  voiceConnected,
  onRefresh,
  onStartSetupTest,
  onPlaySetupTone,
  onRecordSetupSample,
  onPlaySetupRecording,
  onStopSetupTest,
  onLeaveVoice,
  onStart,
  onUpdate,
  onStop,
  onShowOverlay,
  onOpenExternal,
}: ExternalAudioSettingsProps) {
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("");
  const [cableOutputDeviceId, setCableOutputDeviceId] = useState("");
  const [monitorOutputDeviceId, setMonitorOutputDeviceId] = useState("");
  const [microphoneGain, setMicrophoneGain] = useState(1);
  const [soundboardGain, setSoundboardGain] = useState(0.7);
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  const [pendingSwitchAction, setPendingSwitchAction] = useState<
    "live" | "test" | null
  >(null);
  const live = state.status === "live";
  const testing = state.status === "testing";
  const mountedRef = useRef(true);
  const setupSessionRef = useRef(testing);
  const stopSetupTestRef = useRef(onStopSetupTest);

  useEffect(() => {
    stopSetupTestRef.current = onStopSetupTest;
  }, [onStopSetupTest]);

  useEffect(() => {
    if (testing || state.status === "starting") {
      setupSessionRef.current = true;
    } else if (
      state.status === "idle" ||
      state.status === "suspended" ||
      state.status === "error" ||
      state.status === "live"
    ) {
      setupSessionRef.current = false;
    }
  }, [state.status, testing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (setupSessionRef.current) {
        void stopSetupTestRef.current().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!devices || live || testing) return;
    if (!validMonitorOutput(monitorOutputDeviceId, devices)) {
      setHeadphonesConfirmed(false);
    }
    setMicrophoneDeviceId((current) =>
      validPhysicalInput(current, devices)
        ? current
        : (devices.inputs.find((device) => device.cableKind === null)?.id ??
          ""),
    );
    setCableOutputDeviceId((current) =>
      validCableOutput(current, devices)
        ? current
        : (devices.recommendedCableOutputId ?? ""),
    );
    setMonitorOutputDeviceId((current) =>
      validMonitorOutput(current, devices)
        ? current
        : (devices.outputs.find(
            (device) =>
              device.cableKind === null && isLikelyHeadphones(device.label),
          )?.id ?? ""),
    );
  }, [devices, live, monitorOutputDeviceId, testing]);

  const cableOutput = devices?.outputs.find(
    (device) => device.id === cableOutputDeviceId,
  );
  const pairedCableInput = cableOutput?.cableKind
    ? devices?.inputs.find(
        (device) => device.cableKind === cableOutput.cableKind,
      )
    : undefined;
  const safeSetupSelection = Boolean(
    devices &&
    validPhysicalInput(microphoneDeviceId, devices) &&
    validMonitorOutput(monitorOutputDeviceId, devices) &&
    headphonesConfirmed,
  );
  const safeSelection = Boolean(
    devices &&
    validPhysicalInput(microphoneDeviceId, devices) &&
    validCableOutput(cableOutputDeviceId, devices) &&
    validMonitorOutput(monitorOutputDeviceId, devices) &&
    headphonesConfirmed &&
    pairedCableInput,
  );

  async function begin() {
    const config = {
      microphoneDeviceId,
      cableOutputDeviceId,
      monitorOutputDeviceId: monitorOutputDeviceId || null,
      microphoneGain,
      soundboardGain,
    };
    if (voiceConnected) {
      setPendingSwitchAction("live");
      return;
    }
    await onStart(config);
  }

  async function confirmBegin() {
    const action = pendingSwitchAction;
    if (!action) return;
    setPendingSwitchAction(null);
    await onLeaveVoice();
    if (!mountedRef.current) return;
    if (action === "test") {
      await beginSetupTest();
    } else {
      await onStart({
        microphoneDeviceId,
        cableOutputDeviceId,
        monitorOutputDeviceId: monitorOutputDeviceId || null,
        microphoneGain,
        soundboardGain,
      });
    }
  }

  async function startSetupTest() {
    if (voiceConnected) {
      setPendingSwitchAction("test");
      return;
    }
    await beginSetupTest();
  }

  async function beginSetupTest() {
    setupSessionRef.current = true;
    try {
      await onStartSetupTest({
        microphoneDeviceId,
        monitorOutputDeviceId: monitorOutputDeviceId || null,
      });
    } catch (caught) {
      setupSessionRef.current = false;
      throw caught;
    }
  }

  async function stopSetupTest() {
    try {
      await onStopSetupTest();
    } finally {
      setupSessionRef.current = false;
    }
  }

  const installer = cableInstaller(platform ?? "macos");

  return (
    <section
      className="settings-card external-audio-settings"
      aria-labelledby="external-audio-title"
    >
      <div className="settings-card-heading">
        <div>
          <p className="settings-kicker">Other call apps</p>
          <h3 id="external-audio-title">External Soundboard</h3>
          <p>
            Mix your real microphone and Bakbak sounds into a virtual cable for
            Discord, Meet, or another call app.
          </p>
        </div>
        <span className={`external-audio-status is-${state.status}`}>
          <Radio size={14} /> {live ? "LIVE" : state.status}
        </span>
      </div>

      {!platform ? (
        <p className="settings-note">
          External Soundboard is available in the installed Tauri desktop app.
        </p>
      ) : live && state.config ? (
        <div className="external-audio-live-controls">
          <label>
            <span>Microphone</span>
            <meter min="0" max="1" value={levels.microphone} />
          </label>
          <label>
            <span>Mixed output</span>
            <meter min="0" max="1" value={levels.output} />
          </label>
          {levels.clipping ? (
            <p className="settings-error" role="alert">
              The mix is clipping. Lower one of the levels.
            </p>
          ) : null}
          <div className="settings-inline-actions">
            <button
              type="button"
              onClick={() =>
                void onUpdate({ microphoneMuted: !state.microphoneMuted })
              }
            >
              <Mic2 size={15} />
              {state.microphoneMuted ? "Unmute mic" : "Mute mic"}
            </button>
            <button type="button" onClick={() => void onShowOverlay()}>
              Show overlay
            </button>
            <button
              className="danger"
              type="button"
              onClick={() => void onStop()}
            >
              <Square size={14} /> Stop External Soundboard
            </button>
          </div>
          <p className="settings-note">
            Keep your call app’s input set to the cable input. Closing Bakbak
            hides it to the tray while this remains live; Quit always stops it.
          </p>
        </div>
      ) : (
        <div className="external-audio-setup">
          <div className="settings-callout">
            <Headphones size={17} />
            <div>
              <strong>Install a virtual cable first</strong>
              <p>
                Bakbak never installs system audio software silently. Install
                {installer.label}, then refresh devices.
              </p>
              <button
                type="button"
                onClick={() => void onOpenExternal(installer.url)}
              >
                <ExternalLink size={14} /> Open {installer.label}
              </button>
            </div>
          </div>

          <div className="settings-form-grid">
            <label>
              <span>Physical microphone</span>
              <select
                value={microphoneDeviceId}
                disabled={loading || testing}
                onChange={(event) => setMicrophoneDeviceId(event.target.value)}
              >
                <option value="">Choose microphone</option>
                {devices?.inputs
                  .filter((device) => device.cableKind === null)
                  .map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Virtual cable output</span>
              <select
                value={cableOutputDeviceId}
                disabled={loading || testing}
                onChange={(event) => setCableOutputDeviceId(event.target.value)}
              >
                <option value="">Choose cable output</option>
                {devices?.outputs
                  .filter((device) => isSupportedCable(device.cableKind))
                  .map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label} (virtual cable)
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Headphone monitor</span>
              <select
                value={monitorOutputDeviceId}
                disabled={loading || testing}
                onChange={(event) => {
                  setMonitorOutputDeviceId(event.target.value);
                  setHeadphonesConfirmed(false);
                }}
              >
                <option value="">Choose headphones</option>
                {devices?.outputs
                  .filter((device) => device.cableKind === null)
                  .map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Feedback safety</span>
              <span>
                <input
                  type="checkbox"
                  checked={headphonesConfirmed}
                  disabled={loading || testing || !monitorOutputDeviceId}
                  onChange={(event) =>
                    setHeadphonesConfirmed(event.target.checked)
                  }
                />
                I am using headphones, not speakers
              </span>
            </label>
          </div>

          {pairedCableInput ? (
            <div className="settings-callout">
              <Radio size={17} />
              <div>
                <strong>Call-app microphone: {pairedCableInput.label}</strong>
                <p>
                  Choose this capture endpoint in Discord, Meet, or the other
                  call app. Bakbak sends the mix to its paired playback
                  endpoint, {cableOutput?.label}.
                </p>
              </div>
            </div>
          ) : cableOutputDeviceId ? (
            <p className="settings-error" role="alert">
              Bakbak cannot find the paired cable microphone. Reinstall the
              supported 2-channel cable, then refresh devices.
            </p>
          ) : null}

          <div className="settings-callout">
            <Mic2 size={17} />
            <div>
              <strong>Verify microphone and headphones</strong>
              {testing ? (
                <>
                  <label>
                    <span>Microphone input</span>
                    <meter
                      aria-label="Setup microphone input"
                      min="0"
                      max="1"
                      value={levels.microphone}
                    />
                  </label>
                  <label>
                    <span>Headphone test output</span>
                    <meter
                      aria-label="Setup headphone output"
                      min="0"
                      max="1"
                      value={levels.output}
                    />
                  </label>
                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void onPlaySetupTone()}
                    >
                      Play sound test
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void onRecordSetupSample()}
                    >
                      {setupRecordingStatus === "recording"
                        ? "Recording 2 seconds…"
                        : "Record 2-second mic test"}
                    </button>
                    <button
                      type="button"
                      disabled={loading || setupRecordingStatus !== "ready"}
                      onClick={() => void onPlaySetupRecording()}
                    >
                      Play local recording
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void stopSetupTest()}
                    >
                      Finish device test
                    </button>
                  </div>
                  <p>
                    The live microphone is never monitored. The two-second
                    recording stays only in memory and is discarded when this
                    test ends; it is never stored, uploaded, or logged.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Check the live meter, hear a sound in your headphones, then
                    make a short local recording before going LIVE.
                  </p>
                  <button
                    type="button"
                    disabled={loading || !safeSetupSelection}
                    onClick={() => void startSetupTest()}
                  >
                    Test mic and headphones
                  </button>
                  {voiceConnected ? (
                    <p>
                      Leave Bakbak voice before testing so two audio modes never
                      compete for your microphone.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="settings-form-grid">
            <label>
              <span>Microphone · {Math.round(microphoneGain * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={microphoneGain}
                disabled={testing}
                onChange={(event) =>
                  setMicrophoneGain(Number(event.target.value))
                }
              />
            </label>
            <label>
              <span>Sounds · {Math.round(soundboardGain * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundboardGain}
                disabled={testing}
                onChange={(event) =>
                  setSoundboardGain(Number(event.target.value))
                }
              />
            </label>
          </div>

          <p className="settings-note">
            Strong call-app noise removal can mistake a perfectly timed airhorn
            for a problem. Technically rude, acoustically predictable.
          </p>
          {state.message ? (
            <p className="settings-note">{state.message}</p>
          ) : null}
          {error ? (
            <p className="settings-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="settings-inline-actions">
            <button
              type="button"
              disabled={loading || testing}
              onClick={() => void onRefresh()}
            >
              Refresh devices
            </button>
            <button
              className="primary"
              type="button"
              disabled={loading || testing || !safeSelection}
              onClick={() => void begin()}
            >
              Start External Soundboard
            </button>
          </div>
        </div>
      )}

      {pendingSwitchAction ? (
        <Modal
          title="Switch audio modes?"
          onClose={() => setPendingSwitchAction(null)}
        >
          <p>
            External Soundboard and Bakbak voice cannot run together. Bakbak
            will leave the current voice room before
            {pendingSwitchAction === "test"
              ? " testing your microphone and headphones."
              : " opening the virtual mic."}
          </p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setPendingSwitchAction(null)}>
              Keep Bakbak voice
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => void confirmBegin()}
            >
              {pendingSwitchAction === "test"
                ? "Leave voice and test"
                : "Leave voice and start"}
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function validPhysicalInput(
  id: string,
  devices: ExternalAudioDeviceSnapshot,
): boolean {
  return Boolean(
    id &&
    devices.inputs.some(
      (device) => device.id === id && device.cableKind === null,
    ),
  );
}

function validCableOutput(
  id: string,
  devices: ExternalAudioDeviceSnapshot,
): boolean {
  return Boolean(
    id &&
    devices.outputs.some(
      (device) => device.id === id && isSupportedCable(device.cableKind),
    ),
  );
}

function validMonitorOutput(
  id: string,
  devices: ExternalAudioDeviceSnapshot,
): boolean {
  return Boolean(
    id &&
    devices.outputs.some(
      (device) => device.id === id && device.cableKind === null,
    ),
  );
}

function isSupportedCable(kind: ExternalAudioCableKind | null): boolean {
  return kind === "blackhole-2ch" || kind === "vb-cable";
}

function isLikelyHeadphones(label: string): boolean {
  return /head(phone|set)|airpods|earbuds?|buds/i.test(label);
}

function cableInstaller(platform: "macos" | "windows") {
  return platform === "macos"
    ? {
        label: "BlackHole 2ch",
        url: "https://github.com/ExistentialAudio/BlackHole",
      }
    : { label: "VB-CABLE", url: "https://vb-audio.com/Cable/" };
}
