import { corsHeaders, isRequestOriginAllowed } from "../_shared/cors.ts";
import { emptyResponse, jsonResponse } from "../_shared/http.ts";

export interface MessageMediaUser {
  id: string;
}

export interface ReserveInput {
  targetKind: "channel" | "direct";
  targetId: string;
  kind: "image" | "gif" | "video";
  mimeType: string;
  byteSize: number;
  posterByteSize: number;
  width: number;
  height: number;
  durationMs: number | null;
}

export interface MessageMediaDependencies {
  allowedOrigins: ReadonlySet<string>;
  authenticate: (request: Request) => Promise<MessageMediaUser | null>;
  reserve: (user: MessageMediaUser, input: ReserveInput) => Promise<unknown>;
  cancel: (user: MessageMediaUser, attachmentId: string) => Promise<unknown>;
  cleanup: (user: MessageMediaUser) => Promise<unknown>;
  deleteMessage: (
    user: MessageMediaUser,
    messageKind: "channel" | "direct",
    messageId: string,
  ) => Promise<unknown>;
}

export async function handleMessageMediaRequest(
  request: Request,
  dependencies: MessageMediaDependencies,
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
  if (!isRecord(payload) || typeof payload.action !== "string") {
    return jsonResponse({ error: "invalid_payload" }, 400, headers);
  }

  try {
    if (payload.action === "reserve") {
      const input = parseReserve(payload);
      return jsonResponse(
        await dependencies.reserve(user, input),
        201,
        headers,
      );
    }
    if (payload.action === "cancel" && isUuid(payload.attachmentId)) {
      return jsonResponse(
        await dependencies.cancel(user, payload.attachmentId),
        200,
        headers,
      );
    }
    if (payload.action === "cleanup") {
      return jsonResponse(await dependencies.cleanup(user), 200, headers);
    }
    if (
      payload.action === "delete-message" &&
      (payload.messageKind === "channel" || payload.messageKind === "direct") &&
      isUuid(payload.messageId)
    ) {
      return jsonResponse(
        await dependencies.deleteMessage(
          user,
          payload.messageKind,
          payload.messageId,
        ),
        200,
        headers,
      );
    }
    return jsonResponse({ error: "invalid_action" }, 400, headers);
  } catch (error) {
    const code = error instanceof Error ? error.message : "request_failed";
    const status = code.includes("limit")
      ? 409
      : code.includes("access")
        ? 403
        : code.startsWith("invalid") || code === "media_too_large"
          ? 422
          : 500;
    return jsonResponse({ error: code }, status, headers);
  }
}

function parseReserve(payload: Record<string, unknown>): ReserveInput {
  const targetKind = payload.targetKind;
  const kind = payload.kind;
  const mimeType = payload.mimeType;
  const durationMs = payload.durationMs;
  if (
    (targetKind !== "channel" && targetKind !== "direct") ||
    !isUuid(payload.targetId) ||
    (kind !== "image" && kind !== "gif" && kind !== "video") ||
    typeof mimeType !== "string" ||
    !allowedMime(kind, mimeType) ||
    !integerBetween(payload.byteSize, 1, 52_428_800) ||
    !integerBetween(payload.posterByteSize, 1, 10_485_760) ||
    !integerBetween(payload.width, 1, 8192) ||
    !integerBetween(payload.height, 1, 8192) ||
    (kind === "video"
      ? !integerBetween(durationMs, 1, 60_000)
      : durationMs !== null)
  ) {
    throw new Error("invalid_reservation");
  }
  if (
    (kind === "image" && (payload.byteSize as number) > 10_485_760) ||
    (kind === "gif" && (payload.byteSize as number) > 15_728_640) ||
    (kind !== "video" &&
      (payload.width as number) * (payload.height as number) >
        16 * 1024 * 1024) ||
    (kind === "video" &&
      ((payload.width as number) > 1920 || (payload.height as number) > 1080))
  ) {
    throw new Error("media_too_large");
  }
  return {
    targetKind,
    targetId: payload.targetId,
    kind,
    mimeType,
    byteSize: payload.byteSize,
    posterByteSize: payload.posterByteSize,
    width: payload.width,
    height: payload.height,
    durationMs: durationMs as number | null,
  };
}

function allowedMime(kind: ReserveInput["kind"], mime: string): boolean {
  if (kind === "video") return mime === "video/mp4";
  if (kind === "gif") return mime === "image/gif";
  return ["image/png", "image/jpeg", "image/webp"].includes(mime);
}

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
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
