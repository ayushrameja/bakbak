const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TokenRequestResult =
  { ok: true; channelId: string } | { ok: false; error: "invalid_payload" };

export function parseTokenRequest(payload: unknown): TokenRequestResult {
  if (!isRecord(payload) || typeof payload.channelId !== "string") {
    return { ok: false, error: "invalid_payload" };
  }

  const channelId = payload.channelId.trim();

  if (!UUID_PATTERN.test(channelId)) {
    return { ok: false, error: "invalid_payload" };
  }

  return { ok: true, channelId: channelId.toLowerCase() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
