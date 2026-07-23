import { z } from "zod";
import { appConfig } from "./env";
import type { GiphyAssetKind, MessagePresentation } from "./types";

const renditionSchema = z.object({
  url: z.string().url(),
  width: z.string(),
  height: z.string(),
  mp4: z.string().url().optional(),
  webp: z.string().url().optional(),
});

const giphyObjectSchema = z.object({
  id: z.string(),
  title: z.string().default(""),
  alt_text: z.string().optional().default(""),
  type: z.string(),
  images: z.object({
    fixed_width: renditionSchema,
    fixed_width_still: renditionSchema.optional(),
    original: renditionSchema,
  }),
  analytics: z
    .object({
      onload: z.object({ url: z.string().url() }).optional(),
      onclick: z.object({ url: z.string().url() }).optional(),
      onsent: z.object({ url: z.string().url() }).optional(),
    })
    .optional(),
});

export interface GiphyAsset {
  id: string;
  kind: GiphyAssetKind;
  title: string;
  altText: string;
  width: number;
  height: number;
  previewUrl: string;
  stillUrl: string;
  originalUrl: string;
  analytics: {
    onload?: string;
    onclick?: string;
    onsent?: string;
  };
}

export class GiphyRateLimitError extends Error {
  constructor() {
    super("GIPHY is taking a breather. Try again in a little while.");
    this.name = "GiphyRateLimitError";
  }
}

const giphySessionAssets = new Map<string, GiphyAsset>();
const giphyHistoryRequests = new Map<string, Promise<GiphyAsset[]>>();

export function isGiphyConfigured(): boolean {
  return appConfig.giphyApiKey.length > 0;
}

export async function searchGiphy(
  kind: GiphyAssetKind,
  query: string,
  offset = 0,
): Promise<{ assets: GiphyAsset[]; nextOffset: number | null }> {
  const normalized = query.trim();
  if (normalized.length > 0 && normalized.length < 2) {
    return { assets: [], nextOffset: null };
  }
  return await requestGiphy(
    kind === "gif" ? "gifs" : "stickers",
    normalized ? "search" : "trending",
    normalized
      ? { q: normalized, offset: String(offset) }
      : { offset: String(offset) },
  );
}

export async function resolveGiphyAssets(
  ids: readonly string[],
): Promise<GiphyAsset[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  const missing = unique.filter((id) => !giphySessionAssets.has(id));
  const requests: Promise<GiphyAsset[]>[] = [];
  for (let offset = 0; offset < missing.length; offset += 100) {
    const chunk = missing.slice(offset, offset + 100);
    const key = [...chunk].sort().join(",");
    let request = giphyHistoryRequests.get(key);
    if (!request) {
      request = fetch(buildUrl("gifs", "", { ids: chunk.join(",") }))
        .then(parseResponse)
        .then((body) => body.data.map((item) => toAsset(item)))
        .then((assets) => {
          assets.forEach((asset) => giphySessionAssets.set(asset.id, asset));
          return assets;
        })
        .finally(() => giphyHistoryRequests.delete(key));
      giphyHistoryRequests.set(key, request);
    }
    requests.push(request);
  }
  await Promise.all(requests);
  return unique.flatMap((id) => {
    const asset = giphySessionAssets.get(id);
    return asset ? [asset] : [];
  });
}

export function toGiphyPresentation(asset: GiphyAsset): MessagePresentation {
  return {
    kind: "giphy",
    assetId: asset.id,
    assetKind: asset.kind,
    title: asset.title,
    altText: asset.altText,
    width: asset.width,
    height: asset.height,
  };
}

export function registerGiphyAction(
  asset: GiphyAsset,
  action: keyof GiphyAsset["analytics"],
): void {
  const url = asset.analytics[action];
  if (url) void fetch(url, { mode: "no-cors", keepalive: true });
}

async function requestGiphy(
  resource: "gifs" | "stickers",
  endpoint: "search" | "trending",
  parameters: Record<string, string>,
): Promise<{ assets: GiphyAsset[]; nextOffset: number | null }> {
  const response = await fetch(buildUrl(resource, endpoint, parameters));
  const body = await parseResponse(response);
  const assets = body.data.map((item) =>
    toAsset(item, resource === "stickers" ? "sticker" : "gif"),
  );
  const nextOffset =
    body.pagination.count > 0 &&
    body.pagination.offset + body.pagination.count < body.pagination.total_count
      ? body.pagination.offset + body.pagination.count
      : null;
  return { assets, nextOffset };
}

function buildUrl(
  resource: "gifs" | "stickers",
  endpoint: string,
  parameters: Record<string, string>,
): string {
  if (!isGiphyConfigured()) throw new Error("GIPHY is not configured.");
  const path = endpoint ? `${resource}/${endpoint}` : resource;
  const url = new URL(`https://api.giphy.com/v1/${path}`);
  url.searchParams.set("api_key", appConfig.giphyApiKey);
  url.searchParams.set("rating", "r");
  url.searchParams.set("limit", "20");
  url.searchParams.set("bundle", "messaging_non_clips");
  Object.entries(parameters).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return url.toString();
}

async function parseResponse(response: Response) {
  if (response.status === 429) throw new GiphyRateLimitError();
  if (!response.ok) throw new Error("GIPHY could not be reached.");
  return z
    .object({
      data: z.array(giphyObjectSchema),
      pagination: z.object({
        total_count: z.number().default(0),
        count: z.number().default(0),
        offset: z.number().default(0),
      }),
    })
    .parse(await response.json());
}

function toAsset(
  input: z.infer<typeof giphyObjectSchema>,
  forcedKind?: GiphyAssetKind,
): GiphyAsset {
  const preview = input.images.fixed_width;
  const original = input.images.original;
  const kind = forcedKind ?? (input.type === "sticker" ? "sticker" : "gif");
  return {
    id: input.id,
    kind,
    title: input.title,
    altText: input.alt_text || input.title || `${kind} from GIPHY`,
    width: Number(original.width),
    height: Number(original.height),
    previewUrl:
      kind === "sticker"
        ? (preview.webp ?? preview.url)
        : (preview.mp4 ?? preview.webp ?? preview.url),
    stillUrl: input.images.fixed_width_still?.url ?? preview.url,
    originalUrl:
      kind === "sticker"
        ? (original.webp ?? original.url)
        : (original.mp4 ?? original.webp ?? original.url),
    analytics: {
      ...(input.analytics?.onload?.url
        ? { onload: input.analytics.onload.url }
        : {}),
      ...(input.analytics?.onclick?.url
        ? { onclick: input.analytics.onclick.url }
        : {}),
      ...(input.analytics?.onsent?.url
        ? { onsent: input.analytics.onsent.url }
        : {}),
    },
  };
}
