import { corsHeaders, isRequestOriginAllowed } from "../_shared/cors.ts";
import { emptyResponse, jsonResponse } from "../_shared/http.ts";
import { parseTokenRequest } from "./request.ts";

export const LIVEKIT_TOKEN_TTL_SECONDS = 300;

export interface AuthenticatedUser {
  id: string;
}

export interface VoiceChannelAccess {
  channelId: string;
  serverId: string;
  displayName: string;
}

export interface TokenSigningInput extends VoiceChannelAccess {
  identity: string;
  roomName: string;
  ttlSeconds: number;
}

export interface LiveKitTokenDependencies {
  allowedOrigins: ReadonlySet<string>;
  serverUrl: string | null;
  now: () => Date;
  authenticate: (request: Request) => Promise<AuthenticatedUser | null>;
  findVoiceChannelAccess: (
    channelId: string,
    userId: string,
  ) => Promise<VoiceChannelAccess | null>;
  signToken: (input: TokenSigningInput) => Promise<string>;
}

export async function handleLiveKitTokenRequest(
  request: Request,
  dependencies: LiveKitTokenDependencies,
): Promise<Response> {
  const responseHeaders = corsHeaders(request, dependencies.allowedOrigins);

  if (!isRequestOriginAllowed(request, dependencies.allowedOrigins)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, responseHeaders);
  }

  if (request.method === "OPTIONS") {
    return emptyResponse(204, responseHeaders);
  }

  if (request.method !== "POST") {
    responseHeaders.set("Allow", "POST, OPTIONS");
    return jsonResponse({ error: "method_not_allowed" }, 405, responseHeaders);
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { error: "content_type_must_be_json" },
      415,
      responseHeaders,
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_payload" }, 400, responseHeaders);
  }

  const parsedRequest = parseTokenRequest(payload);

  if (!parsedRequest.ok) {
    return jsonResponse({ error: parsedRequest.error }, 400, responseHeaders);
  }

  let user: AuthenticatedUser | null;

  try {
    user = await dependencies.authenticate(request);
  } catch {
    return jsonResponse({ error: "unauthorized" }, 401, responseHeaders);
  }

  if (user === null) {
    return jsonResponse({ error: "unauthorized" }, 401, responseHeaders);
  }

  if (dependencies.serverUrl === null) {
    return jsonResponse(
      { error: "voice_service_unavailable" },
      503,
      responseHeaders,
    );
  }

  let access: VoiceChannelAccess | null;

  try {
    access = await dependencies.findVoiceChannelAccess(
      parsedRequest.channelId,
      user.id,
    );
  } catch {
    return jsonResponse(
      { error: "token_request_failed" },
      500,
      responseHeaders,
    );
  }

  // A missing channel, a text channel, and a channel in another server all use
  // one response so this endpoint cannot be used to enumerate private rooms.
  if (access === null) {
    return jsonResponse(
      { error: "voice_channel_not_found" },
      404,
      responseHeaders,
    );
  }

  const roomName = `bakbak-voice-${access.channelId}`;
  const issuedAt = dependencies.now();
  const expiresAt = new Date(
    issuedAt.getTime() + LIVEKIT_TOKEN_TTL_SECONDS * 1000,
  );

  try {
    const token = await dependencies.signToken({
      ...access,
      identity: user.id,
      roomName,
      ttlSeconds: LIVEKIT_TOKEN_TTL_SECONDS,
    });

    return jsonResponse(
      {
        token,
        serverUrl: dependencies.serverUrl,
        roomName,
        expiresAt: expiresAt.toISOString(),
      },
      200,
      responseHeaders,
    );
  } catch {
    // Do not include signing errors in the response or logs; crypto libraries
    // may include configuration details that do not belong on a client.
    return jsonResponse(
      { error: "token_request_failed" },
      500,
      responseHeaders,
    );
  }
}
