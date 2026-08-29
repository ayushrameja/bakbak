import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(repositoryRoot, "scripts", "check-release-env.mjs");
const validEnvironment = {
  VITE_DATA_MODE: "live",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: `sb_publishable_${"a".repeat(24)}`,
  VITE_LIVEKIT_URL: "wss://project.livekit.cloud",
  VITE_BACKEND_REGION: "Canada Central (ca-central-1)",
  VITE_BUILD_REVISION: "a".repeat(40),
};

test("accepts a complete fail-closed live release environment", () => {
  const result = runCheck();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /configured for live services/i);
});

test("accepts a legacy Supabase JWT only when its role is anon", () => {
  const result = runCheck({
    VITE_SUPABASE_ANON_KEY: legacySupabaseKey("anon"),
  });

  assert.equal(result.status, 0, result.stderr);
});

for (const [label, override] of [
  ["blank backend region", { VITE_BACKEND_REGION: "" }],
  ["malformed Supabase URL", { VITE_SUPABASE_URL: "not-a-url" }],
  ["insecure Supabase URL", { VITE_SUPABASE_URL: "http://project.test" }],
  ["non-websocket LiveKit URL", { VITE_LIVEKIT_URL: "https://livekit.test" }],
  [
    "credentialed service URL",
    { VITE_SUPABASE_URL: "https://user:pass@project.test" },
  ],
  ["padded anonymous key", { VITE_SUPABASE_ANON_KEY: " public-key " }],
  [
    "Supabase secret key",
    { VITE_SUPABASE_ANON_KEY: `sb_secret_${"s".repeat(24)}` },
  ],
  [
    "legacy service-role JWT",
    { VITE_SUPABASE_ANON_KEY: legacySupabaseKey("service_role") },
  ],
]) {
  test(`rejects a ${label}`, () => {
    const result = runCheck(override);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /incomplete or invalid/i);
    if ("VITE_SUPABASE_ANON_KEY" in override) {
      assert.doesNotMatch(
        result.stderr,
        new RegExp(override.VITE_SUPABASE_ANON_KEY),
      );
    }
  });
}

function runCheck(override = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...validEnvironment, ...override },
  });
}

function legacySupabaseKey(role) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.fixture-signature`;
}
