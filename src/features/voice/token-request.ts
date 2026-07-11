export interface LiveKitTokenRequest {
  channelId: string;
}

export interface LiveKitToken {
  token: string;
  serverUrl: string;
  roomName: string | null;
  expiresAt: string | null;
}

export type TokenResponseError =
  | "invalid_payload"
  | "server_error"
  | "missing_token"
  | "missing_server_url"
  | "invalid_server_url"
  | "invalid_expiration"
  | "expired";

export type TokenResponseResult =
  | { ok: true; value: LiveKitToken }
  | { ok: false; error: TokenResponseError; message: string };

export function buildLiveKitTokenRequest(
  channelId: string,
): LiveKitTokenRequest {
  const normalized = channelId.trim();

  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new TypeError("channelId must be a valid channel identifier");
  }

  return { channelId: normalized };
}

/**
 * Validates the untrusted JSON returned by the token Edge Function. `url` is
 * accepted as an alias during migration, but callers always receive serverUrl.
 */
export function parseLiveKitTokenResponse(
  payload: unknown,
  now: Date | number,
): TokenResponseResult {
  if (!isRecord(payload)) {
    return failure("invalid_payload", "Token response must be an object.");
  }

  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    return failure("server_error", payload.error.trim());
  }

  if (typeof payload.token !== "string" || payload.token.trim().length === 0) {
    return failure("missing_token", "Token response did not include a token.");
  }

  const rawServerUrl =
    typeof payload.serverUrl === "string"
      ? payload.serverUrl
      : typeof payload.url === "string"
        ? payload.url
        : null;

  if (rawServerUrl === null || rawServerUrl.trim().length === 0) {
    return failure(
      "missing_server_url",
      "Token response did not include a LiveKit server URL.",
    );
  }

  const serverUrl = normalizeLiveKitUrl(rawServerUrl);

  if (serverUrl === null) {
    return failure(
      "invalid_server_url",
      "LiveKit server URL must use ws:// or wss://.",
    );
  }

  const roomName = readOptionalNonEmptyString(payload.roomName);

  if (roomName === undefined) {
    return failure("invalid_payload", "roomName must be a non-empty string.");
  }

  const expiresAt = readOptionalNonEmptyString(payload.expiresAt);

  if (expiresAt === undefined) {
    return failure(
      "invalid_expiration",
      "expiresAt must be a valid timestamp string.",
    );
  }

  if (expiresAt !== null) {
    const expiration = Date.parse(expiresAt);
    const nowTimestamp = typeof now === "number" ? now : now.getTime();

    if (!Number.isFinite(expiration) || !Number.isFinite(nowTimestamp)) {
      return failure(
        "invalid_expiration",
        "expiresAt must be a valid timestamp string.",
      );
    }

    if (expiration <= nowTimestamp) {
      return failure("expired", "The returned voice token has expired.");
    }
  }

  return {
    ok: true,
    value: {
      token: payload.token.trim(),
      serverUrl,
      roomName,
      expiresAt,
    },
  };
}

function normalizeLiveKitUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      return null;
    }

    return value.trim();
  } catch {
    return null;
  }
}

/** null means absent; undefined means present but malformed. */
function readOptionalNonEmptyString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(
  error: TokenResponseError,
  message: string,
): TokenResponseResult {
  return { ok: false, error, message };
}
