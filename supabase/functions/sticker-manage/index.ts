import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  corsHeaders,
  isRequestOriginAllowed,
  readAllowedOrigins,
} from "../_shared/cors.ts";
import { emptyResponse, jsonResponse } from "../_shared/http.ts";
import { authenticateUserFromClaims } from "../livekit-token/auth.ts";
import { inspectStickerImage } from "./image.ts";

interface Configuration {
  supabaseUrl: string;
  publicKey: string;
  serviceRoleKey: string;
}

Deno.serve(async (request) => {
  const allowedOrigins = readAllowedOrigins(
    Deno.env.get("BAKBAK_ALLOWED_ORIGINS"),
  );
  const headers = corsHeaders(request, allowedOrigins);
  if (!isRequestOriginAllowed(request, allowedOrigins)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, headers);
  }
  if (request.method === "OPTIONS") return emptyResponse(204, headers);
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, headers);
  }

  const configuration = readConfiguration();
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return jsonResponse({ error: "unauthorized" }, 401, headers);
  }
  const requestClient = createRequestClient(authorization, configuration);
  const user = await authenticateUserFromClaims(request, (token) =>
    requestClient.auth.getClaims(token),
  ).catch(() => null);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401, headers);
  const adminClient = createAdminClient(configuration);

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.get("action") !== "upload") throw new Error("invalid_action");
      const serverId = requiredText(form, "serverId");
      const label = requiredText(form, "label").trim();
      const poster = form.get("poster");
      const animation = form.get("animation");
      if (!isUuid(serverId) || label.length < 1 || label.length > 50) {
        throw new Error("invalid_sticker_metadata");
      }
      if (!(poster instanceof File) || poster.size > 5_242_880) {
        throw new Error("poster_required");
      }
      const posterBytes = new Uint8Array(await poster.arrayBuffer());
      const size = inspectStickerImage(posterBytes, poster.type);
      let animationBytes: Uint8Array | null = null;
      if (animation instanceof File) {
        if (animation.type !== "image/gif" || animation.size > 5_242_880) {
          throw new Error("invalid_sticker_animation");
        }
        animationBytes = new Uint8Array(await animation.arrayBuffer());
        const animationSize = inspectStickerImage(
          animationBytes,
          animation.type,
        );
        if (
          animationSize.width !== size.width ||
          animationSize.height !== size.height
        ) {
          throw new Error("sticker_poster_mismatch");
        }
      }

      const root = `${serverId}/${user.id}/${crypto.randomUUID()}`;
      const posterPath = `${root}.webp`;
      const animationPath = animationBytes ? `${root}.gif` : null;
      const uploaded: string[] = [];
      try {
        const posterUpload = await adminClient.storage
          .from("message-stickers")
          .upload(posterPath, posterBytes, {
            contentType: poster.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (posterUpload.error) throw new Error("sticker_upload_failed");
        uploaded.push(posterPath);
        if (animationBytes && animationPath) {
          const animationUpload = await adminClient.storage
            .from("message-stickers")
            .upload(animationPath, animationBytes, {
              contentType: "image/gif",
              cacheControl: "3600",
              upsert: false,
            });
          if (animationUpload.error) throw new Error("sticker_upload_failed");
          uploaded.push(animationPath);
        }
        const { data, error } = await adminClient
          .rpc("publish_message_sticker", {
            p_server_id: serverId,
            p_created_by: user.id,
            p_label: label,
            p_poster_path: posterPath,
            p_animation_path: animationPath,
            p_width: size.width,
            p_height: size.height,
            p_byte_size: poster.size + (animation?.size ?? 0),
          })
          .select(
            "id,server_id,created_by,label,poster_path,animation_path,width,height,enabled,created_at",
          )
          .single();
        if (error || !data) throw new Error(mapError(error?.message));
        return jsonResponse({ sticker: data }, 201, headers);
      } catch (error) {
        if (uploaded.length) {
          await adminClient.storage.from("message-stickers").remove(uploaded);
        }
        throw error;
      }
    }

    const payload = await request.json();
    if (
      !isRecord(payload) ||
      payload.action !== "delete" ||
      !isUuid(payload.stickerId)
    ) {
      throw new Error("invalid_payload");
    }
    const { data, error } = await adminClient
      .rpc("archive_message_sticker", {
        p_sticker_id: payload.stickerId,
        p_actor_id: user.id,
      })
      .select("id,poster_path,animation_path")
      .maybeSingle();
    if (error) throw new Error(mapError(error.message));
    if (!data)
      return jsonResponse({ error: "sticker_delete_forbidden" }, 403, headers);
    const hardDeleted = await hardDeleteUnreferencedSticker(
      adminClient,
      data as {
        id: string;
        poster_path: string;
        animation_path: string | null;
      },
    );
    return jsonResponse(
      { stickerId: payload.stickerId, archived: !hardDeleted, hardDeleted },
      200,
      headers,
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "sticker_request_failed";
    const status = code.includes("limit")
      ? 409
      : code.includes("forbidden")
        ? 403
        : 422;
    return jsonResponse({ error: code }, status, headers);
  }
});

function createRequestClient(
  authorization: string,
  configuration: Configuration,
): SupabaseClient {
  return createClient(configuration.supabaseUrl, configuration.publicKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: authorization } },
  });
}

function createAdminClient(configuration: Configuration): SupabaseClient {
  return createClient(configuration.supabaseUrl, configuration.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function readConfiguration(): Configuration {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    publicKey:
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

function requiredText(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string") throw new Error("invalid_payload");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function mapError(message = ""): string {
  return (
    ["member_sticker_limit", "server_sticker_limit", "member_media_limit"].find(
      (code) => message.includes(code),
    ) ?? "sticker_publish_failed"
  );
}

async function hardDeleteUnreferencedSticker(
  client: SupabaseClient,
  sticker: {
    id: string;
    poster_path: string;
    animation_path: string | null;
  },
): Promise<boolean> {
  const presentation = {
    kind: "sticker",
    sticker_id: sticker.id,
  };
  const [channelMessages, directMessages, reactions] = await Promise.all([
    client
      .from("messages")
      .select("id", { count: "exact", head: true })
      .contains("presentation", presentation),
    client
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .contains("presentation", presentation),
    client
      .from("message_sticker_reactions")
      .select("id", { count: "exact", head: true })
      .eq("sticker_id", sticker.id),
  ]);
  if (
    channelMessages.error ||
    directMessages.error ||
    reactions.error ||
    (channelMessages.count ?? 0) +
      (directMessages.count ?? 0) +
      (reactions.count ?? 0) >
      0
  ) {
    return false;
  }
  const paths = [
    sticker.poster_path,
    ...(sticker.animation_path ? [sticker.animation_path] : []),
  ];
  const removal = await client.storage.from("message-stickers").remove(paths);
  if (removal.error) return false;
  const deletion = await client.from("stickers").delete().eq("id", sticker.id);
  return !deletion.error;
}
