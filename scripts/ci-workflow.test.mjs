import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const cargoConfig = await readFile(
  new URL("../.cargo/config.toml", import.meta.url),
  "utf8",
);
const nodeVersion = (
  await readFile(new URL("../.node-version", import.meta.url), "utf8")
).trim();
const denoVersion = (
  await readFile(new URL("../.dvmrc", import.meta.url), "utf8")
).trim();
const rustToolchain = await readFile(
  new URL("../rust-toolchain.toml", import.meta.url),
  "utf8",
);

test("PR CI validates the complete Tauri stack and packages supported targets", () => {
  assert.match(workflow, /pnpm check/);
  assert.match(workflow, /pnpm electron:compile/);
  assert.match(workflow, /name: macOS Apple Silicon/);
  assert.match(workflow, /runner: macos-26/);
  assert.match(workflow, /rust_target: aarch64-apple-darwin/);
  assert.match(workflow, /name: Windows x64/);
  assert.match(workflow, /runner: windows-latest/);
  assert.match(workflow, /rust_target: x86_64-pc-windows-msvc/);
  assert.match(workflow, /pnpm exec tauri build --target/);
  assert.match(workflow, /src-tauri\/tauri\.macos\.conf\.json/);
  assert.match(workflow, /src-tauri\/tauri\.windows\.conf\.json/);
  assert.match(workflow, /src-tauri\/tauri\.candidate\.conf\.json/);
  assert.doesNotMatch(workflow, /electron-builder/);
  assert.equal(workflow.match(/version: 11\.17\.0/g)?.length, 2);
  assert.equal(workflow.match(/node-version-file: \.node-version/g)?.length, 2);
  assert.equal(workflow.match(/dtolnay\/rust-toolchain@1\.93\.1/g)?.length, 2);
  assert.match(workflow, /denoland\/setup-deno@v2/);
  assert.match(workflow, /deno-version-file: \.dvmrc/);
  assert.doesNotMatch(workflow, /deno-version-file: \.dvmrc\n\s+cache: true/);
  assert.match(
    workflow,
    /cargo fmt --check --manifest-path native\/screen-share-helper\/Cargo\.toml/,
  );
  assert.match(
    workflow,
    /cargo clippy --locked --manifest-path native\/screen-share-helper\/Cargo\.toml --all-targets -- -D warnings/,
  );
  assert.match(
    workflow,
    /cargo clippy --locked --manifest-path native\/external-audio\/Cargo\.toml --all-targets -- -D warnings/,
  );
  assert.match(
    workflow,
    /cargo clippy --locked --manifest-path src-tauri\/Cargo\.toml --all-targets -- -D warnings/,
  );
  assert.match(workflow, /deno task --config supabase\/deno\.json check/);
  assert.match(workflow, /deno task --config supabase\/deno\.json test/);
  assert.match(workflow, /supabase test db/);
  assert.match(workflow, /node scripts\/check-bundle-secrets\.mjs/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(packageJson.scripts["native:build"], /--locked/);
  assert.match(packageJson.scripts["native:test"], /--locked/);
});

test("local and CI toolchains use exact repository versions", () => {
  assert.equal(nodeVersion, "22.23.1");
  assert.equal(denoVersion, "2.7.10");
  assert.equal(packageJson.packageManager, "pnpm@11.17.0");
  assert.match(rustToolchain, /channel = "1\.93\.1"/);
  assert.match(rustToolchain, /components = \["clippy", "rustfmt"\]/);
});

test("Windows helper uses the MSVC runtime required by pinned WebRTC", () => {
  assert.match(cargoConfig, /\[target\.x86_64-pc-windows-msvc\]/);
  assert.match(cargoConfig, /target-feature=\+crt-static/);
});

test("every platform-native gate stops on the first failed Cargo command", async () => {
  for (const name of ["ci", "release", "stabilization-candidate"]) {
    const source = await readFile(
      new URL(`../.github/workflows/${name}.yml`, import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /name: Validate platform-native Rust controllers\n\s+shell: bash\n\s+run: \|/,
      `${name} must not let a later successful command hide an earlier Clippy failure on Windows`,
    );
  }
});
