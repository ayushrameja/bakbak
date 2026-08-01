import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageAttachment, MessageDraft } from "../../lib/types";
import { OptimisticMessageMedia } from "./optimistic-message-media";

const revoke = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revoke,
  });
});

function draft(url = "blob:optimistic"): MessageDraft {
  return {
    text: "",
    mentions: [],
    attachments: [
      {
        id: "local-attachment",
        kind: "image",
        file: new File(["image"], "image.png", { type: "image/png" }),
        poster: new Blob(["poster"], { type: "image/webp" }),
        width: 20,
        height: 10,
        durationMs: null,
        previewUrl: url,
        progress: 0,
        status: "ready",
      },
    ],
  };
}

const persisted: MessageAttachment = {
  id: "persisted-attachment",
  kind: "image",
  mimeType: "image/png",
  byteSize: 5,
  width: 20,
  height: 10,
  durationMs: null,
  objectPath: "user/id/original",
  posterPath: "user/id/poster",
};

describe("OptimisticMessageMedia", () => {
  it("keeps a preview alive across optimistic-to-persisted replacement", () => {
    const media = new OptimisticMessageMedia();
    const [optimistic] = media.stage("pending-1", draft());
    const [replacement] = media.transfer("pending-1", [persisted]);

    expect(optimistic?.optimisticPreviewUrl).toBe("blob:optimistic");
    expect(replacement?.optimisticPreviewUrl).toBe("blob:optimistic");
    expect(revoke).not.toHaveBeenCalled();

    media.release(replacement?.optimisticPreviewKey);
    media.release(replacement?.optimisticPreviewKey);
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:optimistic");
  });

  it("does not revoke a preview when a failed send returns ownership to the draft", () => {
    const media = new OptimisticMessageMedia();
    media.stage("pending-1", draft());

    media.abandon("pending-1", false);
    media.clear();

    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes a cancelled optimistic preview and unmatched replacements exactly once", () => {
    const media = new OptimisticMessageMedia();
    media.stage("pending-cancelled", draft("blob:cancelled"));
    media.abandon("pending-cancelled", true);
    media.abandon("pending-cancelled", true);

    media.stage("pending-empty", draft("blob:unmatched"));
    expect(media.transfer("pending-empty", [])).toEqual([]);
    media.clear();

    expect(revoke.mock.calls).toEqual([["blob:cancelled"], ["blob:unmatched"]]);
  });
});
