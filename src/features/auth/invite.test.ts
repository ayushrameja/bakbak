import { describe, expect, it } from "vitest";

import {
  normalizeInviteCode,
  validateInviteCode,
  validateInviteEligibility,
  type InviteRecord,
} from "./invite";

describe("normalizeInviteCode", () => {
  it("removes presentation separators and normalizes case", () => {
    expect(normalizeInviteCode("  bakb-ak 12 34  ")).toBe("BAKBAK1234");
  });
});

describe("validateInviteCode", () => {
  it("returns the canonical valid code", () => {
    expect(validateInviteCode("bakb-ak12")).toEqual({
      ok: true,
      code: "BAKBAK12",
    });
  });

  it.each([
    ["  ", "required"],
    ["short", "too_short"],
    ["A".repeat(33), "too_long"],
    ["BAKBAK!2", "invalid_characters"],
  ] as const)("rejects %j with %s", (value, error) => {
    expect(validateInviteCode(value)).toMatchObject({ ok: false, error });
  });
});

describe("validateInviteEligibility", () => {
  const available: InviteRecord = {
    code: "BAKBAK12",
    usedAt: null,
    expiresAt: "2026-08-01T00:00:00.000Z",
  };
  const now = new Date("2026-07-11T00:00:00.000Z");

  it("accepts an existing, unused, unexpired invite", () => {
    expect(validateInviteEligibility("bakb-ak12", available, now)).toEqual({
      ok: true,
      code: "BAKBAK12",
    });
  });

  it("does not reveal a different stored code", () => {
    expect(validateInviteEligibility("FRIENDS1", available, now)).toMatchObject(
      {
        ok: false,
        error: "not_found",
      },
    );
  });

  it("rejects a redeemed invite", () => {
    expect(
      validateInviteEligibility(
        "BAKBAK12",
        { ...available, usedAt: "2026-07-10T00:00:00.000Z" },
        now,
      ),
    ).toMatchObject({ ok: false, error: "already_used" });
  });

  it("rejects an invite at its exact expiry time", () => {
    expect(
      validateInviteEligibility(
        "BAKBAK12",
        { ...available, expiresAt: "2026-07-11T00:00:00.000Z" },
        now,
      ),
    ).toMatchObject({ ok: false, error: "expired" });
  });

  it("fails closed when an expiry timestamp is malformed", () => {
    expect(
      validateInviteEligibility(
        "BAKBAK12",
        { ...available, expiresAt: "eventually-ish" },
        now,
      ),
    ).toMatchObject({ ok: false, error: "invalid_record" });
  });
});
