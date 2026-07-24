import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readAllowedOrigins } from "../_shared/cors.ts";
import { authenticateUserFromClaims } from "../livekit-token/auth.ts";
import {
  handleMessageMediaRequest,
  type MessageMediaDependencies,
  type MessageMediaUser,
} from "./request.ts";

interface Configuration {
  supabaseUrl: string;
  publicKey: string;
  serviceRoleKey: string;
}

interface AttachmentRow {
  id: string;
  uploader_id: string;
  object_path: string;
  poster_path: string;
}

Deno.serve((request) => {
  const configuration = readConfiguration();
  return handleMessageMediaRequest(
    request,
    createDependencies(request, configuration),
  );
});

function createDependencies(
  request: Request,
  configuration: Configuration,
): MessageMediaDependencies {
  const clients = () => createClients(request, configuration);
  return {
    allowedOrigins: readAllowedOrigins(Deno.env.get("BAKBAK_ALLOWED_ORIGINS")),
    authenticate: async (incoming) => {
      const authorization = incoming.headers.get("authorization");
      if (!authorization || !configuration.publicKey) return null;
      const client = createRequestClient(authorization, configuration);
      return await authenticateUserFromClaims(incoming, (token) =>
        client.auth.getClaims(token),
      );
    },
    reserve: async (user, input) => {
      const { adminClient } = clients();
      await cleanupUserMedia(adminClient, user);
      const extension =
        input.kind === "video" ? "mp4" : extensionForMime(input.mimeType);
      const root = `${user.id}/${crypto.randomUUID()}`;
      const objectPath = `${root}/original.${extension}`;
      const posterPath = `${root}/poster.webp`;
      const { data, error } = await adminClient
        .rpc("reserve_message_attachment", {
          p_uploader_id: user.id,
          p_channel_id: input.targetKind === "channel" ? input.targetId : null,
          p_conversation_id:
            input.targetKind === "direct" ? input.targetId : null,
          p_kind: input.kind,
          p_mime_type: input.mimeType,
          p_byte_size: input.byteSize,
          p_poster_byte_size: input.posterByteSize,
          p_width: input.width,
          p_height: input.height,
          p_duration_ms: input.durationMs,
          p_object_path: objectPath,
          p_poster_path: posterPath,
        })
        .select("id,uploader_id,object_path,poster_path")
        .single<AttachmentRow>();
      if (error || !data) throw mapDatabaseError(error?.message);

      try {
        const [objectUpload, posterUpload] = await Promise.all([
          adminClient.storage
            .from("message-media")
            .createSignedUploadUrl(objectPath),
          adminClient.storage
            .from("message-media")
            .createSignedUploadUrl(posterPath),
        ]);
        if (objectUpload.error || posterUpload.error) {
          throw new Error("signed_upload_failed");
        }
        return {
          attachmentId: data.id,
          objectPath,
          posterPath,
          objectToken: objectUpload.data.token,
          posterToken: posterUpload.data.token,
        };
      } catch (error) {
        await cancel(adminClient, user, data);
        throw error;
      }
    },
    cancel: async (user, attachmentId) => {
      const { adminClient } = clients();
      const row = await ownedPending(adminClient, user, attachmentId);
      if (!row) return { cancelled: false };
      await cancel(adminClient, user, row);
      return { cancelled: true };
    },
    cleanup: async (user) => {
      const { adminClient } = clients();
      return { cleaned: await cleanupUserMedia(adminClient, user) };
    },
    deleteMessage: async (user, messageKind, messageId) => {
      const { requestClient, adminClient } = clients();
      const { data, error } = await requestClient.rpc("delete_own_message", {
        p_message_kind: messageKind,
        p_message_id: messageId,
      });
      if (error) throw mapDatabaseError(error.message);
      const rows = (data ?? []) as Array<{
        attachment_id: string;
        object_path: string;
        poster_path: string;
      }>;
      if (rows.length) {
        const paths = rows.flatMap((row) => [row.object_path, row.poster_path]);
        const removal = await adminClient.storage
          .from("message-media")
          .remove(paths);
        if (!removal.error) {
          await adminClient
            .from("message_attachments")
            .update({ object_deleted_at: new Date().toISOString() })
            .in(
              "id",
              rows.map((row) => row.attachment_id),
            );
        }
      }
      return { messageId, deleted: true, cleanedObjects: rows.length * 2 };
    },
  };
}

async function ownedPending(
  client: SupabaseClient,
  user: MessageMediaUser,
  attachmentId: string,
): Promise<AttachmentRow | null> {
  const { data } = await client
    .from("message_attachments")
    .select("id,uploader_id,object_path,poster_path")
    .eq("id", attachmentId)
    .eq("uploader_id", user.id)
    .is("published_at", null)
    .is("deleted_at", null)
    .maybeSingle<AttachmentRow>();
  return data;
}

async function cancel(
  client: SupabaseClient,
  user: MessageMediaUser,
  row: AttachmentRow,
): Promise<void> {
  await client.storage
    .from("message-media")
    .remove([row.object_path, row.poster_path]);
  await client.rpc("cancel_message_attachment", {
    p_attachment_id: row.id,
    p_uploader_id: user.id,
  });
}

async function cleanupStale(
  client: SupabaseClient,
  user: MessageMediaUser,
): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await client
    .from("message_attachments")
    .select("id,uploader_id,object_path,poster_path")
    .eq("uploader_id", user.id)
    .is("published_at", null)
    .is("deleted_at", null)
    .lt("created_at", cutoff)
    .returns<AttachmentRow[]>();
  const rows = data ?? [];
  await Promise.all(rows.map((row) => cancel(client, user, row)));
  return rows.length;
}

async function cleanupDeletedObjects(
  client: SupabaseClient,
  user: MessageMediaUser,
): Promise<number> {
  const { data } = await client
    .from("message_attachments")
    .select("id,uploader_id,object_path,poster_path")
    .eq("uploader_id", user.id)
    .not("deleted_at", "is", null)
    .is("object_deleted_at", null)
    .returns<AttachmentRow[]>();
  const rows = data ?? [];
  if (!rows.length) return 0;
  const removal = await client.storage
    .from("message-media")
    .remove(rows.flatMap((row) => [row.object_path, row.poster_path]));
  if (removal.error) return 0;
  await client
    .from("message_attachments")
    .update({ object_deleted_at: new Date().toISOString() })
    .in(
      "id",
      rows.map((row) => row.id),
    );
  return rows.length;
}

async function cleanupUserMedia(
  client: SupabaseClient,
  user: MessageMediaUser,
): Promise<number> {
  const [stale, deleted] = await Promise.all([
    cleanupStale(client, user),
    cleanupDeletedObjects(client, user),
  ]);
  return stale + deleted;
}

function createClients(
  request: Request,
  configuration: Configuration,
): { requestClient: SupabaseClient; adminClient: SupabaseClient } {
  const authorization = request.headers.get("authorization");
  if (!authorization || !configuration.serviceRoleKey) {
    throw new Error("service_unavailable");
  }
  return {
    requestClient: createRequestClient(authorization, configuration),
    adminClient: createClient(
      configuration.supabaseUrl,
      configuration.serviceRoleKey,
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

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  return "webp";
}

function mapDatabaseError(message = ""): Error {
  const known = [
    "member_media_limit",
    "target_access_required",
    "message_delete_forbidden",
  ].find((code) => message.includes(code));
  return new Error(known ?? "message_media_request_failed");
}
