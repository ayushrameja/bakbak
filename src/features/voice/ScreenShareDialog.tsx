import { MonitorUp } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../components/Modal";

export function ScreenShareDialog({
  audioAvailable,
  audioUnavailableReason,
  onStart,
  onClose,
}: {
  audioAvailable: boolean;
  audioUnavailableReason: string | null;
  onStart: (includeAudio: boolean) => void;
  onClose: () => void;
}) {
  const [includeAudio, setIncludeAudio] = useState(false);
  return (
    <Modal
      eyebrow="Present"
      title="Share your screen"
      description="Bakbak will open your system picker so you stay in control of what everyone sees."
      onClose={onClose}
    >
      <div className="screen-share-dialog">
        <div className="screen-share-dialog__preview">
          <MonitorUp size={28} />
          <div>
            <strong>Choose a display, app, or window</strong>
            <span>Sharing stops automatically when you leave voice.</span>
          </div>
        </div>
        <label className={!audioAvailable ? "is-disabled" : ""}>
          <input
            type="checkbox"
            checked={includeAudio}
            disabled={!audioAvailable}
            onChange={(event) => setIncludeAudio(event.target.checked)}
          />
          <span>
            <strong>Include system audio</strong>
            <small>
              {audioAvailable
                ? "Only audio belonging to the selected source is included."
                : (audioUnavailableReason ??
                  "Matched audio is unavailable on this system; video still works.")}
            </small>
          </span>
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              onClose();
              onStart(includeAudio);
            }}
          >
            <MonitorUp size={17} /> Open system picker
          </button>
        </div>
      </div>
    </Modal>
  );
}
