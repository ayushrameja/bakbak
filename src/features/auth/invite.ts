export const INVITE_CODE_MIN_LENGTH = 34;
export const INVITE_CODE_MAX_LENGTH = 34;

const INVITE_CODE_PATTERN = /^BK[0-9A-F]{32}$/;

export type InviteCodeError =
  "required" | "too_short" | "too_long" | "invalid_characters";

export type InviteCodeValidation =
  | { ok: true; code: string }
  | { ok: false; code: string; error: InviteCodeError };

export interface InviteRecord {
  code: string;
  usedAt: string | null;
  expiresAt: string | null;
}

export type InviteEligibilityError =
  InviteCodeError | "not_found" | "already_used" | "expired" | "invalid_record";

export type InviteEligibility =
  | { ok: true; code: string }
  | { ok: false; code: string; error: InviteEligibilityError };

/**
 * Produces the canonical representation hashed by the backend. Separators are
 * presentation-only, so users can paste the grouped code returned by
 * `private.issue_invite_code` or type it with spaces instead of hyphens.
 */
export function normalizeInviteCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

/**
 * Performs syntax validation only. The backend remains authoritative for
 * whether a single-use code exists, is unused, and has not expired.
 */
export function validateInviteCode(value: string): InviteCodeValidation {
  const code = normalizeInviteCode(value);

  if (code.length === 0) {
    return { ok: false, code, error: "required" };
  }

  if (!/^[A-Z0-9]+$/.test(code)) {
    return { ok: false, code, error: "invalid_characters" };
  }

  if (code.length < INVITE_CODE_MIN_LENGTH) {
    return { ok: false, code, error: "too_short" };
  }

  if (code.length > INVITE_CODE_MAX_LENGTH) {
    return { ok: false, code, error: "too_long" };
  }

  if (!INVITE_CODE_PATTERN.test(code)) {
    return { ok: false, code, error: "invalid_characters" };
  }

  return { ok: true, code };
}

/**
 * Models the server-side checks needed before redeeming a code. Invalid
 * timestamps fail closed instead of accidentally making an invite permanent.
 */
export function validateInviteEligibility(
  value: string,
  record: InviteRecord | null,
  now: Date | number,
): InviteEligibility {
  const format = validateInviteCode(value);

  if (!format.ok) {
    return format;
  }

  if (record === null || normalizeInviteCode(record.code) !== format.code) {
    return { ok: false, code: format.code, error: "not_found" };
  }

  if (record.usedAt !== null) {
    return { ok: false, code: format.code, error: "already_used" };
  }

  if (record.expiresAt !== null) {
    const expiresAt = Date.parse(record.expiresAt);

    if (!Number.isFinite(expiresAt)) {
      return { ok: false, code: format.code, error: "invalid_record" };
    }

    const nowTimestamp = typeof now === "number" ? now : now.getTime();

    if (!Number.isFinite(nowTimestamp)) {
      return { ok: false, code: format.code, error: "invalid_record" };
    }

    if (expiresAt <= nowTimestamp) {
      return { ok: false, code: format.code, error: "expired" };
    }
  }

  return { ok: true, code: format.code };
}
