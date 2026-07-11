import { Headphones, Mic2, ShieldCheck, Volume2 } from "lucide-react";
import { Modal } from "../../components/Modal";

interface SettingsModalProps {
  inputDevices: MediaDeviceInfo[];
  selectedInputId: string;
  onInputChange: (deviceId: string) => void;
  onClose: () => void;
}

export function SettingsModal({
  inputDevices,
  selectedInputId,
  onInputChange,
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
          <div className="setting-row">
            <Volume2 size={17} />
            <div>
              <strong>System output</strong>
              <span>Bakbak follows the current desktop speaker.</span>
            </div>
          </div>
          <div className="setting-row">
            <ShieldCheck size={17} />
            <div>
              <strong>Safe by default</strong>
              <span>Device names are never sent to Supabase.</span>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
