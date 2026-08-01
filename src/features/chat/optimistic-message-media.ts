import type {
  MessageAttachment,
  MessageDraft,
  StagedMessageAttachment,
} from "../../lib/types";

interface OptimisticPreview {
  key: string;
  messageId: string;
  attachmentId: string;
  url: string;
}

export class OptimisticMessageMedia {
  private readonly previews = new Map<string, OptimisticPreview>();
  private readonly messageKeys = new Map<string, string[]>();

  stage(messageId: string, draft: MessageDraft): MessageAttachment[] {
    const attachments = draft.attachments ?? [];
    const keys: string[] = [];
    const optimistic = attachments.map((attachment, index) => {
      const key = `${messageId}:${attachment.id}:${index}`;
      keys.push(key);
      this.previews.set(key, {
        key,
        messageId,
        attachmentId: attachment.id,
        url: attachment.previewUrl,
      });
      return optimisticAttachment(attachment, key);
    });
    if (keys.length) this.messageKeys.set(messageId, keys);
    return optimistic;
  }

  transfer(
    messageId: string,
    attachments: readonly MessageAttachment[],
  ): MessageAttachment[] {
    const keys = this.messageKeys.get(messageId) ?? [];
    this.messageKeys.delete(messageId);
    const transferred = attachments.map((attachment, index) => {
      const preview = this.previews.get(keys[index] ?? "");
      return preview
        ? {
            ...attachment,
            optimisticPreviewKey: preview.key,
            optimisticPreviewUrl: preview.url,
          }
        : attachment;
    });
    keys.slice(attachments.length).forEach((key) => this.release(key));
    return transferred;
  }

  abandon(messageId: string, revoke: boolean): void {
    const keys = this.messageKeys.get(messageId) ?? [];
    this.messageKeys.delete(messageId);
    if (revoke) {
      keys.forEach((key) => this.release(key));
      return;
    }
    keys.forEach((key) => this.previews.delete(key));
  }

  release(key: string | null | undefined): void {
    if (!key) return;
    const preview = this.previews.get(key);
    if (!preview) return;
    this.previews.delete(key);
    URL.revokeObjectURL(preview.url);
  }

  activeUrl(key: string | null | undefined): string | null {
    return key ? (this.previews.get(key)?.url ?? null) : null;
  }

  clear(): void {
    [...this.previews.keys()].forEach((key) => this.release(key));
    this.messageKeys.clear();
  }
}

export const optimisticMessageMedia = new OptimisticMessageMedia();

function optimisticAttachment(
  attachment: StagedMessageAttachment,
  previewKey: string,
): MessageAttachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.file.type,
    byteSize: attachment.file.size,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    objectPath: "",
    posterPath: "",
    optimisticPreviewKey: previewKey,
    optimisticPreviewUrl: attachment.previewUrl,
    uploadProgress: attachment.progress,
  };
}
