import { corsHeaders, isRequestOriginAllowed } from "../_shared/cors.ts";
import { emptyResponse, jsonResponse } from "../_shared/http.ts";
import {
  discoverLinkPreview,
  firstMessageUrl,
  type LinkPreview,
  type PreviewEnvironment,
} from "./preview.ts";

export interface PreviewUser {
  id: string;
}

export interface StoredPreviewMessage {
  body: string;
  content: unknown;
  messageKind: "member" | "system";
  linkPreview: LinkPreview | null;
  attemptedAt: string | null;
}

export interface LinkPreviewDependencies {
  allowedOrigins: ReadonlySet<string>;
  authenticate: (request: Request) => Promise<PreviewUser | null>;
  loadMessage: (
    user: PreviewUser,
    scope: "channel" | "direct",
    messageId: string,
  ) => Promise<StoredPreviewMessage | null>;
  saveResult: (
    scope: "channel" | "direct",
    messageId: string,
    preview: LinkPreview | null,
  ) => Promise<void>;
  previewEnvironment: PreviewEnvironment;
  now: () => number;
}

export async function handleLinkPreviewRequest(
  request: Request,
  dependencies: LinkPreviewDependencies,
): Promise<Response> {
  const headers = corsHeaders(request, dependencies.allowedOrigins);
  if (!isRequestOriginAllowed(request, dependencies.allowedOrigins)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, headers);
  }
  if (request.method === "OPTIONS") return emptyResponse(204, headers);
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, headers);
  }
  const user = await dependencies.authenticate(request).catch(() => null);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401, headers);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_payload" }, 400, headers);
  }
  if (
    !isRecord(payload) ||
    (payload.scope !== "channel" && payload.scope !== "direct") ||
    !isUuid(payload.messageId)
  ) {
    return jsonResponse({ error: "invalid_payload" }, 400, headers);
  }

  const message = await dependencies.loadMessage(
    user,
    payload.scope,
    payload.messageId,
  );
  if (!message) {
    return jsonResponse({ error: "message_unavailable" }, 404, headers);
  }
  if (message.linkPreview) {
    return jsonResponse(
      { preview: message.linkPreview, cached: true },
      200,
      headers,
    );
  }
  if (
    message.attemptedAt &&
    dependencies.now() - Date.parse(message.attemptedAt) < 24 * 60 * 60 * 1000
  ) {
    return jsonResponse({ preview: null, cached: true }, 200, headers);
  }
  if (message.messageKind === "system") {
    return jsonResponse({ preview: null, cached: true }, 200, headers);
  }

  const url = firstMessageUrl(message.body, message.content);
  if (!url) return jsonResponse({ preview: null, cached: true }, 200, headers);

  let preview: LinkPreview | null = null;
  try {
    preview = await discoverLinkPreview(url, dependencies.previewEnvironment);
  } catch {
    // A failed or rejected preview must not make the underlying link unusable.
  }
  await dependencies.saveResult(payload.scope, payload.messageId, preview);
  return jsonResponse({ preview, cached: false }, 200, headers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
