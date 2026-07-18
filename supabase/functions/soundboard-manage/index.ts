import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readAllowedOrigins } from "../_shared/cors.ts";
import { authenticateUserFromClaims } from "../livekit-token/auth.ts";
import { canManageSound } from "./authorization.ts";
import {
  handleSoundboardManageRequest,
  SoundboardManageError,
  type AuthenticatedSoundboardUser,
  type SoundboardUploadRequest,
} from "./handler.ts";
import { publishAfterObjectUpload } from "./publication.ts";

interface FunctionConfiguration {
  supabaseUrl: string;
  supabasePublicKey: string;
  supabaseServiceRoleKey: string;
}

interface MembershipRow {
  role: "admin" | "member";
}

interface CategoryRow {
  id: string;
}

interface SoundRow {
  id: string;
  server_id: string;
  category_id: string;
  label: string;
  emoji: string;
  object_path: string;
  duration_ms: number;
  position: number;
  audio_revision: number;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
}

const SOUND_SELECT =
  "id,server_id,category_id,label,emoji,object_path,duration_ms,position,audio_revision,enabled,created_by,created_at";

Deno.serve((request) => {
  const configuration = readConfiguration();
  return handleSoundboardManageRequest(request, {
    allowedOrigins: readAllowedOrigins(Deno.env.get("BAKBAK_ALLOWED_ORIGINS")),
    authenticate: (incomingRequest) =>
      authenticateUser(incomingRequest, configuration),
    uploadSound: (user, input) =>
      uploadSound(request, configuration, user, input),
    deleteSound: (user, soundId) =>
      deleteSound(request, configuration, user, soundId),
  });
});

async function authenticateUser(
  request: Request,
  configuration: FunctionConfiguration,
): Promise<AuthenticatedSoundboardUser | null> {
  const authorization = request.headers.get("authorization");
  if (
    authorization === null ||
    configuration.supabaseUrl.length === 0 ||
    configuration.supabasePublicKey.length === 0
  ) {
    return null;
  }

  const client = createRequestClient(authorization, configuration);
  return await authenticateUserFromClaims(request, (token) =>
    client.auth.getClaims(token),
  );
}

async function uploadSound(
  request: Request,
  configuration: FunctionConfiguration,
  user: AuthenticatedSoundboardUser,
  input: SoundboardUploadRequest,
): Promise<SoundRow> {
  const { requestClient, adminClient } = createClients(request, configuration);
  const [membershipResult, categoryResult] = await Promise.all([
    requestClient
      .from("memberships")
      .select("role")
      .eq("server_id", input.serverId)
      .eq("user_id", user.id)
      .maybeSingle<MembershipRow>(),
    requestClient
      .from("soundboard_categories")
      .select("id")
      .eq("server_id", input.serverId)
      .eq("accepts_uploads", true)
      .maybeSingle<CategoryRow>(),
  ]);

  if (membershipResult.error || categoryResult.error) {
    throw new SoundboardManageError("soundboard_access_failed", 500);
  }
  if (!membershipResult.data || !categoryResult.data) {
    throw new SoundboardManageError("server_membership_required", 403);
  }

  const uploadCategoryId = categoryResult.data.id;
  const path = `${input.serverId}/${user.id}/${crypto.randomUUID()}.wav`;
  return await publishAfterObjectUpload(
    async () => {
      const uploadResult = await adminClient.storage
        .from("soundboard")
        .upload(path, input.clip, {
          cacheControl: "3600",
          contentType: "audio/wav",
          upsert: false,
        });
      if (uploadResult.error) {
        throw new SoundboardManageError("sound_upload_failed", 500);
      }
    },
    async () => {
      const { data, error } = await adminClient.rpc(
        "create_soundboard_upload",
        {
          p_server_id: input.serverId,
          p_category_id: uploadCategoryId,
          p_created_by: user.id,
          p_label: input.label,
          p_emoji: input.emoji,
          p_object_path: path,
          p_duration_ms: input.durationMs,
        },
      );

      if (error) {
        if (error.message.includes("member_upload_limit")) {
          throw new SoundboardManageError("member_upload_limit", 409);
        }
        if (error.message.includes("server_upload_limit")) {
          throw new SoundboardManageError("server_upload_limit", 409);
        }
        throw new SoundboardManageError("sound_publish_failed", 500);
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!isSoundRow(row)) {
        throw new SoundboardManageError("sound_publish_failed", 500);
      }
      return row;
    },
    async () => {
      await adminClient.storage.from("soundboard").remove([path]);
    },
  );
}

async function deleteSound(
  request: Request,
  configuration: FunctionConfiguration,
  user: AuthenticatedSoundboardUser,
  soundId: string,
): Promise<{ soundId: string; archived: boolean }> {
  const { requestClient, adminClient } = createClients(request, configuration);
  const soundResult = await adminClient
    .from("soundboard_sounds")
    .select(SOUND_SELECT)
    .eq("id", soundId)
    .maybeSingle<SoundRow>();

  if (soundResult.error) {
    throw new SoundboardManageError("sound_delete_failed", 500);
  }
  const sound = soundResult.data;
  if (!sound) throw new SoundboardManageError("sound_not_found", 404);

  const membershipResult = await requestClient
    .from("memberships")
    .select("role")
    .eq("server_id", sound.server_id)
    .eq("user_id", user.id)
    .maybeSingle<MembershipRow>();

  if (membershipResult.error) {
    throw new SoundboardManageError("soundboard_access_failed", 500);
  }
  const membership = membershipResult.data;
  if (!membership) {
    throw new SoundboardManageError("server_membership_required", 403);
  }
  if (!canManageSound(sound.created_by, user.id, membership.role)) {
    throw new SoundboardManageError("sound_delete_forbidden", 403);
  }

  if (sound.created_by === null) {
    const { error } = await adminClient
      .from("soundboard_sounds")
      .update({ enabled: false })
      .eq("id", sound.id);
    if (error) throw new SoundboardManageError("sound_delete_failed", 500);
    return { soundId, archived: true };
  }

  const disableResult = await adminClient
    .from("soundboard_sounds")
    .update({ enabled: false })
    .eq("id", sound.id);
  if (disableResult.error) {
    throw new SoundboardManageError("sound_delete_failed", 500);
  }

  const removeResult = await adminClient.storage
    .from("soundboard")
    .remove([sound.object_path]);
  if (removeResult.error) {
    throw new SoundboardManageError("sound_object_delete_failed", 500);
  }

  const deleteResult = await adminClient
    .from("soundboard_sounds")
    .delete()
    .eq("id", sound.id);
  if (deleteResult.error) {
    throw new SoundboardManageError("sound_delete_failed", 500);
  }
  return { soundId, archived: false };
}

function createClients(
  request: Request,
  configuration: FunctionConfiguration,
): { requestClient: SupabaseClient; adminClient: SupabaseClient } {
  const authorization = request.headers.get("authorization");
  if (
    authorization === null ||
    configuration.supabaseUrl.length === 0 ||
    configuration.supabasePublicKey.length === 0 ||
    configuration.supabaseServiceRoleKey.length === 0
  ) {
    throw new SoundboardManageError("soundboard_service_unavailable", 503);
  }

  return {
    requestClient: createRequestClient(authorization, configuration),
    adminClient: createClient(
      configuration.supabaseUrl,
      configuration.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    ),
  };
}

function createRequestClient(
  authorization: string,
  configuration: FunctionConfiguration,
): SupabaseClient {
  return createClient(
    configuration.supabaseUrl,
    configuration.supabasePublicKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: { headers: { Authorization: authorization } },
    },
  );
}

function readConfiguration(): FunctionConfiguration {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    supabasePublicKey:
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      "",
    supabaseServiceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

function isSoundRow(value: unknown): value is SoundRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "server_id" in value &&
    typeof value.server_id === "string" &&
    "created_at" in value &&
    typeof value.created_at === "string"
  );
}
