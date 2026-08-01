import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  findCompiledBundleRoots,
  inspectCompiledBundles,
} from "./check-bundle-secrets.mjs";

test("secret scan includes generic and target-specific Tauri bundles", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "bakbak-secret-scan-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const generic = join(cwd, "src-tauri", "target", "release", "bundle");
  const targeted = join(
    cwd,
    "src-tauri",
    "target",
    "aarch64-apple-darwin",
    "release",
    "bundle",
  );
  await mkdir(join(cwd, "dist"), { recursive: true });
  await mkdir(generic, { recursive: true });
  await mkdir(targeted, { recursive: true });

  assert.deepEqual(findCompiledBundleRoots(cwd), [
    join(cwd, "dist"),
    generic,
    targeted,
  ]);

  await writeFile(
    join(targeted, "renderer.js"),
    "const leaked = 'SUPABASE_SERVICE_ROLE_KEY';\n",
  );
  const result = inspectCompiledBundles({ cwd });
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0], /SUPABASE_SERVICE_ROLE_KEY/);
});

test("secret scan checks configured secret values without reporting clean output", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "bakbak-secret-value-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const dist = join(cwd, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, "clean.js"), "export const safe = true;\n");

  const environment = { LIVEKIT_API_SECRET: "a-real-secret-value" };
  assert.deepEqual(inspectCompiledBundles({ cwd, environment }).findings, []);

  await writeFile(
    join(dist, "leaked.js"),
    "export const value = 'a-real-secret-value';\n",
  );
  assert.deepEqual(inspectCompiledBundles({ cwd, environment }).findings, [
    "dist/leaked.js: contains a configured secret value",
  ]);
});
