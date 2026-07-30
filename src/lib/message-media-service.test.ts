import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadMessagePoster,
  MessageMediaRetrievalError,
  readableTusUploadError,
  signedResumableEndpoint,
  signedResumableHeaders,
  validateMessagePoster,
} from "./message-media-service";

const state = vi.hoisted(() => ({
  session: vi.fn(),
  download: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  evict: vi.fn(),
}));

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: state.session },
    storage: {
      from: () => ({ download: state.download }),
    },
  }),
}));

vi.mock("./local-cache", () => ({
  BakbakCache: class {
    readMessageMedia = state.read;
    writeMessageMedia = state.write;
    evictMessageMedia = state.evict;
  },
}));

describe("signed resumable message uploads", () => {
  it("uses Supabase's signed TUS endpoint on hosted and local projects", () => {
    expect(signedResumableEndpoint("https://project-ref.supabase.co")).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
    );
    expect(signedResumableEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable/sign",
    );
  });

  it("authorizes the signed endpoint with the project key and scoped signature", () => {
    expect(signedResumableHeaders("public-key", "signed-path-token")).toEqual({
      apikey: "public-key",
      "x-signature": "signed-path-token",
    });
  });

  it("turns Storage authorization failures into a retryable user message", () => {
    const failure = readableTusUploadError({
      originalResponse: {
        getStatus: () => 403,
      },
    });

    expect(failure.message).toContain("secure media upload was rejected");
  });
});

describe("authenticated message posters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.session.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });
    state.read.mockResolvedValue(null);
    state.download.mockResolvedValue({
      data: new Blob(["poster"], { type: "image/webp" }),
      error: null,
    });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 20,
        height: 10,
        close: vi.fn(),
      }),
    );
  });

  it("accepts a valid cached poster without touching private Storage", async () => {
    const cached = new Blob(["cached"], { type: "image/webp" });
    state.read.mockResolvedValue(cached);

    await expect(downloadMessagePoster("user/poster.webp")).resolves.toBe(
      cached,
    );
    expect(state.download).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
  });

  it("evicts an invalid cached poster and performs one validated fresh download", async () => {
    state.read.mockResolvedValue(new Blob([], { type: "image/webp" }));
    const fresh = new Blob(["fresh"], { type: "image/webp" });
    state.download.mockResolvedValue({ data: fresh, error: null });

    await expect(downloadMessagePoster("user/poster.webp")).resolves.toBe(
      fresh,
    );
    expect(state.evict).toHaveBeenCalledOnce();
    expect(state.download).toHaveBeenCalledOnce();
    expect(state.write).toHaveBeenCalledWith(
      "user-1",
      "message-media",
      "user/poster.webp",
      fresh,
    );
  });

  it("evicts a cached decode failure and does not loop when the fresh poster also fails", async () => {
    state.read.mockResolvedValue(new Blob(["cached"], { type: "image/webp" }));
    state.download.mockResolvedValue({
      data: new Blob(["fresh"], { type: "image/webp" }),
      error: null,
    });
    vi.mocked(createImageBitmap).mockRejectedValue(
      new Error("synthetic decode failure"),
    );

    await expect(
      downloadMessagePoster("user/poster.webp"),
    ).rejects.toMatchObject({
      failure: "decode",
      diagnostic: "message-poster:decode-failed",
    });
    expect(state.evict).toHaveBeenCalledOnce();
    expect(state.download).toHaveBeenCalledOnce();
    expect(state.write).not.toHaveBeenCalled();
  });

  it("classifies Storage outcomes without caching failed data", async () => {
    for (const [statusCode, failure] of [
      [403, "forbidden"],
      [404, "missing"],
      [503, "transient"],
    ] as const) {
      vi.clearAllMocks();
      state.session.mockResolvedValue({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      });
      state.read.mockResolvedValue(null);
      state.download.mockResolvedValue({
        data: null,
        error: { statusCode },
      });

      await expect(
        downloadMessagePoster(`user/${statusCode}.webp`),
      ).rejects.toMatchObject({ failure });
      expect(state.write).not.toHaveBeenCalled();
    }
  });

  it("rejects unauthenticated access before reading or populating the cache", async () => {
    state.session.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(
      downloadMessagePoster("someone/private.webp"),
    ).rejects.toMatchObject({
      failure: "unauthenticated",
    });
    expect(state.read).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
  });

  it("does not cache a download if the authenticated account changes in flight", async () => {
    state.session
      .mockResolvedValueOnce({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { user: { id: "user-2" } } },
        error: null,
      });

    await expect(
      downloadMessagePoster("shared-looking/path.webp"),
    ).rejects.toMatchObject({
      failure: "unauthenticated",
      diagnostic: "message-media:session-changed",
    });
    expect(state.write).not.toHaveBeenCalled();
  });

  it("reports offline retrieval explicitly and never writes a cache entry", async () => {
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    try {
      await expect(
        downloadMessagePoster("user/offline.webp"),
      ).rejects.toMatchObject({
        failure: "offline",
        diagnostic: "message-media:offline",
      });
      expect(state.download).not.toHaveBeenCalled();
      expect(state.write).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
    }
  });

  it("rejects empty, unsupported, and undecodable poster blobs", async () => {
    await expect(
      validateMessagePoster(new Blob([], { type: "image/webp" }), vi.fn()),
    ).rejects.toBeInstanceOf(MessageMediaRetrievalError);
    await expect(
      validateMessagePoster(
        new Blob(["svg"], { type: "image/svg+xml" }),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ failure: "invalid" });
    await expect(
      validateMessagePoster(
        new Blob(["image"], { type: "image/png" }),
        vi.fn().mockRejectedValue(new Error("decode")),
      ),
    ).rejects.toMatchObject({ failure: "decode" });
  });
});
