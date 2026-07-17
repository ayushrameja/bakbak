import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export const AVATAR_BUCKET = "avatars";
export const COVER_BUCKET = "profile-covers";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_COVER_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 8192;
export const MAX_DESCRIPTION_LENGTH = 190;
export const ALLOWED_PROFILE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const PROFILE_ROW_SELECT =
  "id,display_name,avatar_url,avatar_path,avatar_animation_path,cover_path,cover_animation_path,cover_position_x,cover_position_y,description";

export type ProfileMediaKind = "avatar" | "cover";

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path: string | null;
  avatar_animation_path: string | null;
  cover_path: string | null;
  cover_animation_path: string | null;
  cover_position_x: number;
  cover_position_y: number;
  description: string;
}

export interface ProfileUpdateInput {
  userId: string;
  displayName: string;
  description: string;
  currentAvatarPath: string | null;
  currentAvatarAnimationPath: string | null;
  currentAvatarUrl?: string | null;
  currentCoverPath: string | null;
  currentCoverAnimationPath: string | null;
  avatarFile?: File | null;
  coverFile?: File | null;
  removeAvatar?: boolean;
  removeCover?: boolean;
  coverPositionX: number;
  coverPositionY: number;
}

export interface SavedProfile {
  id: string;
  displayName: string;
  description: string;
  avatarPath: string | null;
  avatarAnimationPath: string | null;
  avatarUrl: string | null;
  coverPath: string | null;
  coverAnimationPath: string | null;
  coverPositionX: number;
  coverPositionY: number;
  metadataWarning: string | null;
}

export interface PreparedProfileImage {
  poster: Blob;
  animation: File | null;
  width: number;
  height: number;
}

interface UploadedObject {
  bucket: typeof AVATAR_BUCKET | typeof COVER_BUCKET;
  path: string;
}

export function validateDisplayName(displayName: string): string {
  const normalized = displayName.trim();
  if (normalized.length < 1 || normalized.length > 50) {
    throw new Error("Display name must be between 1 and 50 characters.");
  }
  return normalized;
}

export function validateDescription(description: string): string {
  const normalized = description.trim();
  if (normalized.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}

export function validateCoverPosition(value: number): number {
  const normalized = Math.round(value);
  if (!Number.isFinite(value) || normalized < 0 || normalized > 100) {
    throw new Error("Cover position must stay between 0 and 100.");
  }
  return normalized;
}

export function validateProfileImageFile(
  file: File,
  kind: ProfileMediaKind,
): void {
  const maximum = kind === "avatar" ? MAX_AVATAR_BYTES : MAX_COVER_BYTES;
  if (file.size > maximum) {
    throw new Error(
      `Choose ${kind === "avatar" ? "an avatar" : "a cover"} smaller than ${
        maximum / 1024 / 1024
      } MiB.`,
    );
  }
  if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type as never)) {
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  }
}

export function validateAvatarFile(file: File): void {
  validateProfileImageFile(file, "avatar");
}

export function validateCoverFile(file: File): void {
  validateProfileImageFile(file, "cover");
}

export async function prepareProfileImage(
  file: File,
  kind: ProfileMediaKind,
): Promise<PreparedProfileImage> {
  validateProfileImageFile(file, kind);
  const source = await decodeImage(file);
  try {
    const { naturalWidth: width, naturalHeight: height } = source;
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_EDGE ||
      height > MAX_IMAGE_EDGE ||
      width * height > MAX_IMAGE_PIXELS
    ) {
      throw new Error(
        "Choose an image no larger than 8192 px per side or 16 megapixels.",
      );
    }
    const maximumEdge = kind === "avatar" ? 512 : 1600;
    const scale = Math.min(1, maximumEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This device could not prepare that image.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const poster =
      (await canvasToBlob(canvas, "image/webp", 0.86)) ??
      (await canvasToBlob(canvas, "image/png"));
    if (!poster) throw new Error("This device could not prepare that image.");
    return {
      poster,
      animation: file.type === "image/gif" ? file : null,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(source.src);
  }
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That image could not be decoded."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function downloadProfileMediaObjectUrl(
  bucket: typeof AVATAR_BUCKET | typeof COVER_BUCKET,
  path: string | null,
  fallbackUrl: string | null = null,
): Promise<string | null> {
  if (!path) return fallbackUrl;
  const { data, error } = await getSupabaseClient()
    .storage.from(bucket)
    .download(path);
  if (error) throw error;
  return typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(data)
    : fallbackUrl;
}

export function downloadAvatarObjectUrl(
  avatarPath: string | null,
  legacyAvatarUrl: string | null = null,
): Promise<string | null> {
  return downloadProfileMediaObjectUrl(
    AVATAR_BUCKET,
    avatarPath,
    legacyAvatarUrl,
  );
}

export async function saveLiveProfile(
  input: ProfileUpdateInput,
): Promise<SavedProfile> {
  const supabase = getSupabaseClient();
  const displayName = validateDisplayName(input.displayName);
  const description = validateDescription(input.description);
  const coverPositionX = validateCoverPosition(input.coverPositionX);
  const coverPositionY = validateCoverPosition(input.coverPositionY);
  const avatarFile = input.removeAvatar ? null : input.avatarFile;
  const coverFile = input.removeCover ? null : input.coverFile;
  const uploaded: UploadedObject[] = [];

  let nextAvatarPath = input.removeAvatar ? null : input.currentAvatarPath;
  let nextAvatarAnimationPath = input.removeAvatar
    ? null
    : input.currentAvatarAnimationPath;
  let nextCoverPath = input.removeCover ? null : input.currentCoverPath;
  let nextCoverAnimationPath = input.removeCover
    ? null
    : input.currentCoverAnimationPath;

  try {
    if (avatarFile) {
      const prepared = await prepareProfileImage(avatarFile, "avatar");
      nextAvatarPath = await uploadProfileObject(
        AVATAR_BUCKET,
        input.userId,
        prepared.poster,
        uploaded,
      );
      nextAvatarAnimationPath = prepared.animation
        ? await uploadProfileObject(
            AVATAR_BUCKET,
            input.userId,
            prepared.animation,
            uploaded,
          )
        : null;
    }
    if (coverFile) {
      const prepared = await prepareProfileImage(coverFile, "cover");
      nextCoverPath = await uploadProfileObject(
        COVER_BUCKET,
        input.userId,
        prepared.poster,
        uploaded,
      );
      nextCoverAnimationPath = prepared.animation
        ? await uploadProfileObject(
            COVER_BUCKET,
            input.userId,
            prepared.animation,
            uploaded,
          )
        : null;
    }

    const profileUpdate = {
      display_name: displayName,
      description,
      avatar_path: nextAvatarPath,
      avatar_animation_path: nextAvatarAnimationPath,
      cover_path: nextCoverPath,
      cover_animation_path: nextCoverAnimationPath,
      cover_position_x: input.removeCover ? 50 : coverPositionX,
      cover_position_y: input.removeCover ? 50 : coverPositionY,
      ...((input.removeAvatar || avatarFile) && { avatar_url: null }),
    };
    const { data, error } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", input.userId)
      .select(PROFILE_ROW_SELECT)
      .single<ProfileRow>();
    if (error) throw error;

    let metadataWarning: string | null = null;
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    if (metadataError) {
      metadataWarning =
        "Your profile saved, but the sign-in fallback name could not be refreshed.";
    }

    let avatarUrl =
      input.removeAvatar || avatarFile
        ? null
        : (input.currentAvatarUrl ?? data.avatar_url);
    if (data.avatar_path) {
      try {
        avatarUrl = await downloadAvatarObjectUrl(
          data.avatar_path,
          data.avatar_url,
        );
      } catch {
        metadataWarning ??=
          "Your profile saved, but the new photo could not be displayed yet.";
      }
    }

    await removeReplacedObjects(input, data);
    return profileFromRow(data, avatarUrl, metadataWarning);
  } catch (error) {
    await removeUploadedObjects(uploaded);
    throw error;
  }
}

async function uploadProfileObject(
  bucket: UploadedObject["bucket"],
  userId: string,
  body: Blob,
  uploaded: UploadedObject[],
): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}`;
  const { error } = await getSupabaseClient()
    .storage.from(bucket)
    .upload(path, body, {
      cacheControl: "3600",
      contentType: body.type,
      upsert: false,
    });
  if (error) throw error;
  uploaded.push({ bucket, path });
  return path;
}

async function removeUploadedObjects(objects: UploadedObject[]): Promise<void> {
  const byBucket = new Map<UploadedObject["bucket"], string[]>();
  objects.forEach(({ bucket, path }) => {
    const paths = byBucket.get(bucket) ?? [];
    paths.push(path);
    byBucket.set(bucket, paths);
  });
  await Promise.all(
    [...byBucket].map(([bucket, paths]) =>
      getSupabaseClient()
        .storage.from(bucket)
        .remove(paths)
        .catch(() => undefined),
    ),
  );
}

async function removeReplacedObjects(
  input: ProfileUpdateInput,
  data: ProfileRow,
): Promise<void> {
  const stale: UploadedObject[] = [];
  addIfReplaced(
    stale,
    AVATAR_BUCKET,
    input.currentAvatarPath,
    data.avatar_path,
  );
  addIfReplaced(
    stale,
    AVATAR_BUCKET,
    input.currentAvatarAnimationPath,
    data.avatar_animation_path,
  );
  addIfReplaced(stale, COVER_BUCKET, input.currentCoverPath, data.cover_path);
  addIfReplaced(
    stale,
    COVER_BUCKET,
    input.currentCoverAnimationPath,
    data.cover_animation_path,
  );
  await removeUploadedObjects(stale);
}

function addIfReplaced(
  objects: UploadedObject[],
  bucket: UploadedObject["bucket"],
  previous: string | null,
  next: string | null,
): void {
  if (previous && previous !== next) objects.push({ bucket, path: previous });
}

function profileFromRow(
  row: ProfileRow,
  avatarUrl: string | null,
  metadataWarning: string | null,
): SavedProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    avatarPath: row.avatar_path,
    avatarAnimationPath: row.avatar_animation_path,
    avatarUrl,
    coverPath: row.cover_path,
    coverAnimationPath: row.cover_animation_path,
    coverPositionX: row.cover_position_x,
    coverPositionY: row.cover_position_y,
    metadataWarning,
  };
}

export function subscribeToProfileChanges(
  onProfile: (profile: ProfileRow) => void,
): () => void {
  const supabase = getSupabaseClient();
  let stopped = false;
  let snapshotStarted = false;
  let snapshotApplied = false;
  const bufferedProfiles: ProfileRow[] = [];
  const receive = (profile: ProfileRow) => {
    if (snapshotApplied) onProfile(profile);
    else bufferedProfiles.push(profile);
  };
  const channel: RealtimeChannel = supabase
    .channel("profiles:visible-members")
    .on<ProfileRow>(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles" },
      (payload) => receive(payload.new),
    )
    .subscribe((status) => {
      if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED || snapshotStarted) {
        return;
      }
      snapshotStarted = true;
      void (async () => {
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select(PROFILE_ROW_SELECT)
            .returns<ProfileRow[]>();
          if (stopped) return;
          if (!error) data.forEach(onProfile);
        } catch {
          if (stopped) return;
        }
        snapshotApplied = true;
        bufferedProfiles.splice(0).forEach(onProfile);
      })();
    });
  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
