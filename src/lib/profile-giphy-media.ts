import { resolveGiphyAssets, type GiphyAsset } from "./giphy-service";
import type { AppUser } from "./types";

export interface ResolvedGiphyProfileMedia {
  avatarPosterUrl: string | null;
  avatarAnimationUrl: string | null;
  coverPosterUrl: string | null;
  coverAnimationUrl: string | null;
}

type GiphyProfileIdentity = Pick<AppUser, "avatarGiphyId" | "coverGiphyId">;

export async function resolveGiphyProfileMedia(
  profile: GiphyProfileIdentity,
  options: {
    includeAvatarAnimation?: boolean;
    includeCover?: boolean;
    includeCoverAnimation?: boolean;
  } = {},
): Promise<ResolvedGiphyProfileMedia> {
  const ids = [
    profile.avatarGiphyId,
    options.includeCover ? profile.coverGiphyId : null,
  ].filter((id): id is string => Boolean(id));
  const assets = await resolveGiphyAssets(ids);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const avatar = assetFor(byId, profile.avatarGiphyId);
  const cover = options.includeCover
    ? assetFor(byId, profile.coverGiphyId)
    : null;

  return {
    avatarPosterUrl: avatar?.stillUrl ?? null,
    avatarAnimationUrl: options.includeAvatarAnimation
      ? (avatar?.previewImageUrl ?? null)
      : null,
    coverPosterUrl: cover?.originalStillUrl ?? null,
    coverAnimationUrl: options.includeCoverAnimation
      ? (cover?.originalImageUrl ?? null)
      : null,
  };
}

export async function hydrateGiphyAvatarPosters<T extends AppUser>(
  profiles: readonly T[],
): Promise<T[]> {
  const ids = profiles
    .map((profile) => profile.avatarGiphyId)
    .filter((id): id is string => Boolean(id));
  if (!ids.length) return [...profiles];

  const assets = await resolveGiphyAssets(ids);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return profiles.map((profile) => {
    if (!profile.avatarGiphyId) return profile;
    return {
      ...profile,
      avatarUrl: byId.get(profile.avatarGiphyId)?.stillUrl ?? null,
      avatarAnimationUrl: null,
    };
  });
}

function assetFor(
  assets: ReadonlyMap<string, GiphyAsset>,
  id: string | null,
): GiphyAsset | null {
  return id ? (assets.get(id) ?? null) : null;
}
