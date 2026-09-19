import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  findCompiledBundleRoots,
  inspectCompiledBundles,
} from "./check-bundle-secrets.mjs";

test("secret scan includes renderer, fallback, and Tauri package outputs", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "bakbak-secret-scan-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const electron = join(cwd, "electron-dist");
  const release = join(cwd, "release");
  const tauriRelease = join(cwd, "release-tauri");
  const tauriBundle = join(
    cwd,
    "src-tauri",
    "target",
    "aarch64-apple-darwin",
    "release",
    "bundle",
  );
  const tauriExecutable = join(
    cwd,
    "src-tauri",
    "target",
    "aarch64-apple-darwin",
    "release",
    "bakbak",
  );
  const stagedSidecar = join(
    cwd,
    "src-tauri",
    "binaries",
    "bakbak-screen-share-helper-aarch64-apple-darwin",
  );
  await mkdir(join(cwd, "dist"), { recursive: true });
  await mkdir(electron, { recursive: true });
  await mkdir(release, { recursive: true });
  await mkdir(tauriRelease, { recursive: true });
  await mkdir(tauriBundle, { recursive: true });
  await mkdir(join(cwd, "src-tauri", "binaries"), { recursive: true });
  await writeFile(tauriExecutable, Buffer.from([0]));
  await writeFile(stagedSidecar, Buffer.from([0]));

  assert.deepEqual(findCompiledBundleRoots(cwd), [
    join(cwd, "dist"),
    electron,
    release,
    tauriRelease,
    tauriBundle,
    tauriExecutable,
    stagedSidecar,
  ]);

  await writeFile(
    join(tauriBundle, "renderer.js"),
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

test("secret scan rejects modern Supabase secret keys without needing the value in CI", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "bakbak-secret-prefix-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const dist = join(cwd, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(
    join(dist, "renderer.js"),
    `export const leaked = "sb_secret_${"x".repeat(32)}";\n`,
  );

  assert.deepEqual(inspectCompiledBundles({ cwd }).findings, [
    "dist/renderer.js: contains forbidden secret prefix sb_secret_",
  ]);
});

test("secret scan checks binary artifacts and matches across read chunks", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "bakbak-secret-binary-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const bundle = join(cwd, "release-tauri");
  await mkdir(bundle, { recursive: true });
  const prefix = Buffer.alloc(1024 * 1024 - 5, 0x7f);
  await writeFile(
    join(bundle, "Bakbak-setup.exe"),
    Buffer.concat([
      prefix,
      Buffer.from("LIVEKIT_API_SECRET"),
      Buffer.alloc(32),
    ]),
  );

  assert.deepEqual(inspectCompiledBundles({ cwd }).findings, [
    "release-tauri/Bakbak-setup.exe: contains forbidden variable name LIVEKIT_API_SECRET",
  ]);
});
