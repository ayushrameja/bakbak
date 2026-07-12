const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TokenRequestResult =
  | { ok: true; channelId: string; purpose: LiveKitTokenPurpose }
  | { ok: false; error: "invalid_payload" };

export type LiveKitTokenPurpose = "voice" | "screen_share";

export function parseTokenRequest(payload: unknown): TokenRequestResult {
  if (!isRecord(payload) || typeof payload.channelId !== "string") {
    return { ok: false, error: "invalid_payload" };
  }

  const channelId = payload.channelId.trim();
  const purpose = payload.purpose ?? "voice";

  if (
    !UUID_PATTERN.test(channelId) ||
    (purpose !== "voice" && purpose !== "screen_share")
  ) {
    return { ok: false, error: "invalid_payload" };
  }

  return {
    ok: true,
    channelId: channelId.toLowerCase(),
    purpose,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
