import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readAllowedOrigins } from "../_shared/cors.ts";
import { authenticateUserFromClaims } from "../livekit-token/auth.ts";
import {
  handleLinkPreviewRequest,
  type PreviewUser,
  type StoredPreviewMessage,
} from "./request.ts";

interface Configuration {
  supabaseUrl: string;
  publicKey: string;
  serviceRoleKey: string;
}

Deno.serve((request) => {
  const configuration = readConfiguration();
  const clients = createClients(request, configuration);
  return handleLinkPreviewRequest(request, {
    allowedOrigins: readAllowedOrigins(Deno.env.get("BAKBAK_ALLOWED_ORIGINS")),
    authenticate: async (incoming) => {
      const authorization = incoming.headers.get("authorization");
      if (!authorization) return null;
      return await authenticateUserFromClaims(incoming, (token) =>
        clients.request.auth.getClaims(token),
      );
    },
    loadMessage: async (user, scope, messageId) =>
      await loadMessage(clients.request, user, scope, messageId),
    saveResult: async (scope, messageId, preview) => {
      const table = scope === "channel" ? "messages" : "direct_messages";
      const { error } = await clients.admin
        .from(table)
        .update({
          link_preview: preview,
          link_preview_attempted_at: new Date().toISOString(),
        })
        .eq("id", messageId);
      if (error) throw error;
    },
    previewEnvironment: {
      resolve: async (hostname, family) =>
        await Deno.resolveDns(hostname, family),
      fetch: globalThis.fetch.bind(globalThis),
    },
    now: Date.now,
  });
});

async function loadMessage(
  client: SupabaseClient,
  _user: PreviewUser,
  scope: "channel" | "direct",
  messageId: string,
): Promise<StoredPreviewMessage | null> {
  const table = scope === "channel" ? "messages" : "direct_messages";
  const selection =
    scope === "channel"
      ? "body,content,message_kind,link_preview,link_preview_attempted_at"
      : "body,content,link_preview,link_preview_attempted_at";
  const { data, error } = await client
    .from(table)
    .select(selection)
    .eq("id", messageId)
    .maybeSingle<Record<string, unknown>>();
  if (error || !data) return null;
  return {
    body: typeof data.body === "string" ? data.body : "",
    content: data.content,
    messageKind: data.message_kind === "system" ? "system" : "member",
    linkPreview:
      data.link_preview && typeof data.link_preview === "object"
        ? (data.link_preview as StoredPreviewMessage["linkPreview"])
        : null,
    attemptedAt:
      typeof data.link_preview_attempted_at === "string"
        ? data.link_preview_attempted_at
        : null,
  };
}

function createClients(
  request: Request,
  configuration: Configuration,
): { request: SupabaseClient; admin: SupabaseClient } {
  const authorization = request.headers.get("authorization") ?? "";
  const shared = {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  };
  return {
    request: createClient(configuration.supabaseUrl, configuration.publicKey, {
      ...shared,
      global: { headers: { Authorization: authorization } },
    }),
    admin: createClient(
      configuration.supabaseUrl,
      configuration.serviceRoleKey,
      shared,
    ),
  };
}

function readConfiguration(): Configuration {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    publicKey:
      Deno.env.get("SB_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}
