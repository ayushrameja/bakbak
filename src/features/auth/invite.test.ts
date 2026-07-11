import { describe, expect, it } from "vitest";

import {
  normalizeInviteCode,
  validateInviteCode,
  validateInviteEligibility,
  type InviteRecord,
} from "./invite";

const issuedInvite = "BK-0123ABCD-4567EF89-89ABCDEF-01234567";
const canonicalInvite = "BK0123ABCD4567EF8989ABCDEF01234567";

describe("normalizeInviteCode", () => {
  it("normalizes the grouped format returned by the backend", () => {
    expect(normalizeInviteCode(`  ${issuedInvite.toLowerCase()}  `)).toBe(
      canonicalInvite,
    );
  });
});

describe("validateInviteCode", () => {
  it("accepts a code in the exact format returned by the backend", () => {
    expect(validateInviteCode(issuedInvite)).toEqual({
      ok: true,
      code: canonicalInvite,
    });
  });

  it("accepts lowercase codes with whitespace separators", () => {
    expect(
      validateInviteCode("bk 0123abcd 4567ef89 89abcdef 01234567"),
    ).toEqual({
      ok: true,
      code: canonicalInvite,
    });
  });

  it.each([
    ["  ", "required"],
    [`BK-${"A".repeat(31)}`, "too_short"],
    [`BK-${"A".repeat(33)}`, "too_long"],
    [`BK-${"A".repeat(31)}!`, "invalid_characters"],
    [`NO-${"A".repeat(32)}`, "invalid_characters"],
    [`BK-${"A".repeat(31)}G`, "invalid_characters"],
  ] as const)("rejects %j with %s", (value, error) => {
    expect(validateInviteCode(value)).toMatchObject({ ok: false, error });
  });
});

describe("validateInviteEligibility", () => {
  const available: InviteRecord = {
    code: issuedInvite,
    usedAt: null,
    expiresAt: "2026-08-01T00:00:00.000Z",
  };
  const now = new Date("2026-07-11T00:00:00.000Z");

  it("accepts an existing, unused, unexpired invite", () => {
    expect(
      validateInviteEligibility(issuedInvite.toLowerCase(), available, now),
    ).toEqual({
      ok: true,
      code: canonicalInvite,
    });
  });

  it("does not reveal a different stored code", () => {
    expect(
      validateInviteEligibility(`BK-${"F".repeat(32)}`, available, now),
    ).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("rejects a redeemed invite", () => {
    expect(
      validateInviteEligibility(
        issuedInvite,
        { ...available, usedAt: "2026-07-10T00:00:00.000Z" },
        now,
      ),
    ).toMatchObject({ ok: false, error: "already_used" });
  });

  it("rejects an invite at its exact expiry time", () => {
    expect(
      validateInviteEligibility(
        issuedInvite,
        { ...available, expiresAt: "2026-07-11T00:00:00.000Z" },
        now,
      ),
    ).toMatchObject({ ok: false, error: "expired" });
  });

  it("fails closed when an expiry timestamp is malformed", () => {
    expect(
      validateInviteEligibility(
        issuedInvite,
        { ...available, expiresAt: "eventually-ish" },
        now,
      ),
    ).toMatchObject({ ok: false, error: "invalid_record" });
  });
});
