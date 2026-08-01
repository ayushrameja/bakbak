import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationMessage,
  MessageAttachment,
  MessageDraft,
  Sticker,
} from "../../lib/types";
import { RichMessageMedia } from "./RichMessageMedia";
import { optimisticMessageMedia } from "./optimistic-message-media";

const media = vi.hoisted(() => ({
  downloadPoster: vi.fn(),
  downloadObject: vi.fn(),
}));

vi.mock("../../lib/message-media-service", () => {
  class MessageMediaRetrievalError extends Error {
    constructor(
      readonly failure: string,
      readonly diagnostic: string,
    ) {
      super("The downloaded image could not be decoded.");
    }
  }
  return {
    downloadMessagePoster: media.downloadPoster,
    downloadMessageMedia: media.downloadObject,
    MessageMediaRetrievalError,
    messageMediaDiagnostic: (error: unknown) =>
      error &&
      typeof error === "object" &&
      "diagnostic" in error &&
      typeof error.diagnostic === "string"
        ? {
            message:
              "message" in error && typeof error.message === "string"
                ? error.message
                : "Private storage did not respond. Retry this image.",
            diagnostic: error.diagnostic,
          }
        : {
            message: "Private storage did not respond. Retry this image.",
            diagnostic: "message-media:transient",
          },
  };
});

const message: ConversationMessage = {
  id: "message-1",
  authorId: "user-1",
  body: "[Sticker]",
  content: [],
  createdAt: "2026-07-23T10:00:00.000Z",
  presentation: { kind: "sticker", stickerId: "sticker-1" },
};

const sticker: Sticker = {
  id: "sticker-1",
  serverId: "server-1",
  label: "Wave",
  posterPath: "wave.webp",
  animationPath: "wave.gif",
  width: 128,
  height: 128,
  createdBy: "user-1",
  enabled: true,
  createdAt: "2026-07-23T10:00:00.000Z",
  posterUrl: "blob:poster",
  animationUrl: "blob:animation",
};

describe("RichMessageMedia reduced motion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("renders the static custom-sticker poster instead of its GIF", () => {
    render(
      <RichMessageMedia
        message={message}
        stickersById={new Map([[sticker.id, sticker]])}
      />,
    );
    expect(screen.getByRole("img", { name: "Wave" })).toHaveAttribute(
      "src",
      sticker.posterUrl,
    );
  });
});

describe("RichMessageMedia private posters", () => {
  let created = 0;
  const revoke = vi.fn();

  beforeEach(() => {
    optimisticMessageMedia.clear();
    vi.clearAllMocks();
    media.downloadPoster.mockReset();
    media.downloadObject.mockReset();
    created = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => `blob:persisted-${++created}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revoke,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    media.downloadPoster.mockResolvedValue(
      new Blob(["poster"], { type: "image/webp" }),
    );
    media.downloadObject.mockResolvedValue(
      new Blob(["original"], { type: "image/png" }),
    );
  });

  it("keeps the optimistic preview through replacement and revokes it only after the poster loads", async () => {
    const replacement = transferredAttachment("blob:optimistic");
    const view = renderMedia(replacement);

    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "blob:optimistic",
    );
    await waitFor(() =>
      expect(screen.getByRole("presentation")).toHaveAttribute(
        "src",
        "blob:persisted-1",
      ),
    );
    expect(revoke).not.toHaveBeenCalledWith("blob:optimistic");

    fireEvent.load(screen.getByRole("presentation"));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:optimistic");

    view.unmount();
    expect(revoke.mock.calls).toEqual([
      ["blob:optimistic"],
      ["blob:persisted-1"],
    ]);
  });

  it("preserves the active optimistic preview across navigation before retrieval completes", async () => {
    let finish: ((blob: Blob) => void) | undefined;
    media.downloadPoster.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    const replacement = transferredAttachment("blob:navigation");
    const firstView = renderMedia(replacement);
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "blob:navigation",
    );
    firstView.unmount();
    expect(revoke).not.toHaveBeenCalledWith("blob:navigation");

    media.downloadPoster.mockResolvedValueOnce(
      new Blob(["fresh"], { type: "image/webp" }),
    );
    renderMedia(replacement);
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "blob:navigation",
    );
    finish?.(new Blob(["stale"], { type: "image/webp" }));
    await waitFor(() =>
      expect(screen.getByRole("presentation")).toHaveAttribute(
        "src",
        "blob:persisted-1",
      ),
    );
    fireEvent.load(screen.getByRole("presentation"));
    expect(revoke).toHaveBeenCalledWith("blob:navigation");
  });

  it("retries one element decode failure with a fresh authenticated poster", async () => {
    media.downloadPoster
      .mockResolvedValueOnce(new Blob(["cached"], { type: "image/webp" }))
      .mockRejectedValueOnce({
        message: "The downloaded image could not be decoded.",
        diagnostic: "message-poster:decode-failed",
      });
    renderMedia(persistedAttachment);

    await waitFor(() =>
      expect(screen.getByRole("presentation")).toHaveAttribute(
        "src",
        "blob:persisted-1",
      ),
    );
    fireEvent.error(screen.getByRole("presentation"));

    await screen.findByText(/Image unavailable/);
    expect(media.downloadPoster).toHaveBeenCalledTimes(2);
    expect(media.downloadPoster).toHaveBeenLastCalledWith(
      persistedAttachment.posterPath,
      { refresh: true },
    );
    expect(
      screen.getByText("message-poster:decode-failed"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("makes a failed fresh poster recoverable without exposing transport details", async () => {
    media.downloadPoster.mockRejectedValue({
      message: "You no longer have access to this private image.",
      diagnostic: "message-media:storage-403",
      signedUrl: "https://secret.example/token",
    });
    renderMedia(persistedAttachment);

    expect(await screen.findByText(/Image unavailable/)).toHaveTextContent(
      "You no longer have access",
    );
    expect(screen.getByText("message-media:storage-403")).toBeVisible();
    expect(screen.queryByText(/secret\.example/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(media.downloadPoster).toHaveBeenLastCalledWith(
      persistedAttachment.posterPath,
      { refresh: true },
    );
  });
});

const persistedAttachment: MessageAttachment = {
  id: "attachment-1",
  kind: "image",
  mimeType: "image/png",
  byteSize: 5,
  width: 20,
  height: 10,
  durationMs: null,
  objectPath: "user/id/original",
  posterPath: "user/id/poster",
};

function transferredAttachment(url: string): MessageAttachment {
  const draft: MessageDraft = {
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
  optimisticMessageMedia.stage("pending-message", draft);
  return optimisticMessageMedia.transfer("pending-message", [
    persistedAttachment,
  ])[0]!;
}

function renderMedia(attachment: MessageAttachment) {
  return render(
    <RichMessageMedia
      message={{
        id: "message-with-media",
        authorId: "user-1",
        body: "[Image]",
        content: [],
        createdAt: "2026-07-30T10:00:00.000Z",
        attachments: [attachment],
      }}
      stickersById={new Map()}
    />,
  );
}
