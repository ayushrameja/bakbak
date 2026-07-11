import { Camera, Headphones, Mic2, ShieldCheck } from "lucide-react";
import { Modal } from "../../components/Modal";

interface SettingsModalProps {
  inputDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  cameraDevices: MediaDeviceInfo[];
  selectedInputId: string;
  selectedOutputId: string;
  selectedCameraId: string;
  inputError: string | null;
  outputError: string | null;
  cameraError: string | null;
  inputDisabled: boolean;
  outputSelectionSupported: boolean;
  onInputChange: (deviceId: string) => void;
  onOutputChange: (deviceId: string) => void;
  onCameraChange: (deviceId: string) => void;
  onClose: () => void;
}

export function SettingsModal({
  inputDevices,
  outputDevices,
  cameraDevices,
  selectedInputId,
  selectedOutputId,
  selectedCameraId,
  inputError,
  outputError,
  cameraError,
  inputDisabled,
  outputSelectionSupported,
  onInputChange,
  onOutputChange,
  onCameraChange,
  onClose,
}: SettingsModalProps) {
  return (
    <Modal
      title="Voice & audio"
      description="Device choices stay on this computer. Your microphone deserves boundaries too."
      onClose={onClose}
    >
      <div className="settings-grid">
        <section className="settings-section">
          <div className="settings-section__title">
            <Mic2 size={18} />
            <span>Microphone</span>
          </div>
          <label>
            <span>Input device</span>
            <select
              value={selectedInputId}
              disabled={inputDisabled}
              onChange={(event) => onInputChange(event.target.value)}
            >
              <option value="default">System default</option>
              {inputDevices
                .filter((device) => device.deviceId !== "default")
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
          {inputError ? (
            <p className="settings-error" role="alert">
              {inputError}
            </p>
          ) : null}
          {inputDisabled ? (
            <p className="settings-note">
              Finish connecting before changing microphones.
            </p>
          ) : null}
          <div className="audio-meter" aria-label="Input level preview">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <p className="settings-hint">
            The live input meter becomes active after joining a voice room.
          </p>
        </section>
        <section className="settings-section settings-section--quiet">
          <div className="settings-section__title">
            <Headphones size={18} />
            <span>Output</span>
          </div>
          <label>
            <span>Speaker</span>
            <select
              value={selectedOutputId}
              disabled={inputDisabled || !outputSelectionSupported}
              onChange={(event) => onOutputChange(event.target.value)}
            >
              <option value="default">System default</option>
              {outputDevices
                .filter((device) => device.deviceId !== "default")
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
          {!outputSelectionSupported ? (
            <p className="settings-note">
              System output only in this browser or desktop runtime.
            </p>
          ) : null}
          {outputError ? (
            <p className="settings-error" role="alert">
              {outputError}
            </p>
          ) : null}
          <p className="settings-hint">
            Call audio and soundboard playback use this speaker. Message alerts
            keep using system output.
          </p>
        </section>
        <section className="settings-section settings-section--quiet">
          <div className="settings-section__title">
            <Camera size={18} />
            <span>Camera</span>
          </div>
          <label>
            <span>Video device</span>
            <select
              value={selectedCameraId}
              disabled={inputDisabled}
              onChange={(event) => onCameraChange(event.target.value)}
            >
              <option value="default">System default</option>
              {cameraDevices
                .filter((device) => device.deviceId !== "default")
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
          {cameraError ? (
            <p className="settings-error" role="alert">
              {cameraError}
            </p>
          ) : null}
          <p className="settings-hint">
            Camera stays off until you turn it on inside a voice room.
          </p>
        </section>
        <section className="settings-section settings-section--quiet">
          <div className="setting-row">
            <ShieldCheck size={17} />
            <div>
              <strong>Safe by default</strong>
              <span>Only device IDs are remembered on this computer.</span>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
