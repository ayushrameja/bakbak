import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path: string | null;
}

export interface ProfileUpdateInput {
  userId: string;
  displayName: string;
  currentAvatarPath: string | null;
  currentAvatarUrl?: string | null;
  avatarFile?: File | null;
  removeAvatar?: boolean;
}

export interface SavedProfile {
  id: string;
  displayName: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  metadataWarning: string | null;
}

export function validateDisplayName(displayName: string): string {
  const normalized = displayName.trim();
  if (normalized.length < 1 || normalized.length > 50) {
    throw new Error("Display name must be between 1 and 50 characters.");
  }
  return normalized;
}

export function validateAvatarFile(file: File): void {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Choose an avatar smaller than 2 MiB.");
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type as never)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
}

export async function downloadAvatarObjectUrl(
  avatarPath: string | null,
  legacyAvatarUrl: string | null = null,
): Promise<string | null> {
  if (!avatarPath) return legacyAvatarUrl;
  const { data, error } = await getSupabaseClient()
    .storage.from(AVATAR_BUCKET)
    .download(avatarPath);
  if (error) throw error;
  return typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(data)
    : legacyAvatarUrl;
}

export async function saveLiveProfile(
  input: ProfileUpdateInput,
): Promise<SavedProfile> {
  const supabase = getSupabaseClient();
  const displayName = validateDisplayName(input.displayName);
  const avatarFile = input.removeAvatar ? null : input.avatarFile;
  let uploadedPath: string | null = null;
  let nextAvatarPath = input.removeAvatar ? null : input.currentAvatarPath;

  if (avatarFile) {
    validateAvatarFile(avatarFile);
    uploadedPath = `${input.userId}/${crypto.randomUUID()}`;
    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(uploadedPath, avatarFile, {
        cacheControl: "3600",
        contentType: avatarFile.type,
        upsert: false,
      });
    if (error) throw error;
    nextAvatarPath = uploadedPath;
  }

  const profileUpdate: {
    display_name: string;
    avatar_path: string | null;
    avatar_url?: null;
  } = { display_name: displayName, avatar_path: nextAvatarPath };
  if (input.removeAvatar) profileUpdate.avatar_url = null;

  const { data, error } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", input.userId)
    .select("id,display_name,avatar_url,avatar_path")
    .single<ProfileRow>();

  if (error) {
    if (uploadedPath) {
      await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([uploadedPath])
        .catch(() => undefined);
    }
    throw error;
  }

  let metadataWarning: string | null = null;
  const { error: metadataError } = await supabase.auth.updateUser({
    data: { display_name: displayName },
  });
  if (metadataError) {
    metadataWarning =
      "Your profile saved, but the sign-in fallback name could not be refreshed.";
  }

  let avatarUrl = input.removeAvatar
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

  const oldPath = input.currentAvatarPath;
  if (oldPath && oldPath !== data.avatar_path) {
    await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([oldPath])
      .catch(() => undefined);
  }

  return {
    id: data.id,
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    avatarUrl,
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
            .select("id,display_name,avatar_url,avatar_path")
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
