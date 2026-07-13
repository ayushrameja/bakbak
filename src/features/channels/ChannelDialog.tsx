import { Hash, Volume2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/Modal";
import type { Channel, ChannelKind } from "../../lib/types";

interface ChannelDialogProps {
  kind: ChannelKind;
  channel?: Channel | null;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export function ChannelDialog({
  kind,
  channel = null,
  onSave,
  onClose,
}: ChannelDialogProps) {
  const [name, setName] = useState(channel?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(channel);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized) {
      setError("Give the room a name first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(normalized);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `That ${kind} channel could not be saved.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow={editing ? "Room details" : "A new corner"}
      title={editing ? `Rename ${channel?.name}` : `Create a ${kind} channel`}
      description={
        editing
          ? "The room keeps its history and active voice connection."
          : kind === "text"
            ? "A new table for messages, links, and heroic amounts of context."
            : "A drop-in room for talking without scheduling a meeting about it."
      }
      onClose={onClose}
    >
      <form className="channel-dialog" onSubmit={(event) => void submit(event)}>
        <div className="channel-kind-preview">
          {kind === "text" ? <Hash size={18} /> : <Volume2 size={18} />}
          <span>{kind === "text" ? "Text channel" : "Voice channel"}</span>
          <small>Type cannot be changed later</small>
        </div>
        <label className="settings-field">
          <span>Channel name</span>
          <input
            autoFocus
            value={name}
            minLength={1}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save name" : "Create channel"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
