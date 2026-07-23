import { afterEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "./env";
import {
  GiphyRateLimitError,
  registerGiphyAction,
  searchGiphy,
  toGiphyPresentation,
  type GiphyAsset,
} from "./giphy-service";

const originalKey = appConfig.giphyApiKey;

afterEach(() => {
  Object.defineProperty(appConfig, "giphyApiKey", {
    value: originalKey,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe("GIPHY messaging adapter", () => {
  it("uses the messaging bundle, r rating, attribution-safe metadata, and analytics", async () => {
    Object.defineProperty(appConfig, "giphyApiKey", {
      value: "public-test-key",
      configurable: true,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "gif-1",
                title: "Excellent",
                alt_text: "An excellent reaction",
                type: "gif",
                images: {
                  fixed_width: {
                    url: "https://media.giphy.com/preview.gif",
                    mp4: "https://media.giphy.com/preview.mp4",
                    width: "200",
                    height: "120",
                  },
                  fixed_width_still: {
                    url: "https://media.giphy.com/still.webp",
                    width: "200",
                    height: "120",
                  },
                  original: {
                    url: "https://media.giphy.com/original.gif",
                    mp4: "https://media.giphy.com/original.mp4",
                    width: "600",
                    height: "360",
                  },
                },
                analytics: {
                  onsent: { url: "https://analytics.giphy.com/sent" },
                },
              },
            ],
            pagination: { count: 1, offset: 0, total_count: 1 },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await searchGiphy("gif", "excellent");
    const requestInput = fetchMock.mock.calls[0]?.[0];
    const requestUrl = new URL(
      typeof requestInput === "string"
        ? requestInput
        : requestInput instanceof URL
          ? requestInput.toString()
          : (requestInput?.url ?? ""),
    );
    expect(requestUrl.pathname).toBe("/v1/gifs/search");
    expect(requestUrl.searchParams.get("rating")).toBe("r");
    expect(requestUrl.searchParams.get("bundle")).toBe("messaging_non_clips");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
    expect(toGiphyPresentation(result.assets[0]!)).toEqual({
      kind: "giphy",
      assetId: "gif-1",
      assetKind: "gif",
      title: "Excellent",
      altText: "An excellent reaction",
      width: 600,
      height: 360,
    });

    registerGiphyAction(result.assets[0]!, "onsent");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://analytics.giphy.com/sent",
      { keepalive: true, mode: "no-cors" },
    );
  });

  it("does not request one-character searches and exposes HTTP 429 as retryable", async () => {
    Object.defineProperty(appConfig, "giphyApiKey", {
      value: "public-test-key",
      configurable: true,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 429 }));
    await expect(searchGiphy("gif", "x")).resolves.toEqual({
      assets: [],
      nextOffset: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(searchGiphy("sticker", "wow")).rejects.toBeInstanceOf(
      GiphyRateLimitError,
    );
  });

  it("never puts provider URLs in persisted presentation metadata", () => {
    const asset: GiphyAsset = {
      id: "asset",
      kind: "sticker",
      title: "Wave",
      altText: "A waving sticker",
      width: 120,
      height: 120,
      previewUrl: "https://media.giphy.com/preview.webp",
      stillUrl: "https://media.giphy.com/still.webp",
      originalUrl: "https://media.giphy.com/original.webp",
      analytics: {},
    };
    expect(JSON.stringify(toGiphyPresentation(asset))).not.toContain(
      "giphy.com",
    );
  });
});
