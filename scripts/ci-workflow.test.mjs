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

test("PR CI validates and packages only the two supported Electron targets", () => {
  assert.match(workflow, /run: pnpm check/);
  assert.match(workflow, /run: pnpm electron:compile/);
  assert.match(workflow, /name: macOS Apple Silicon/);
  assert.match(workflow, /runner: macos-26/);
  assert.match(workflow, /builder_args: --mac --arm64/);
  assert.match(workflow, /name: Windows x64/);
  assert.match(workflow, /runner: windows-latest/);
  assert.match(workflow, /builder_args: --win --x64/);
  assert.match(workflow, /pnpm exec electron-builder/);
  assert.match(workflow, /dtolnay\/rust-toolchain@stable/);
  assert.match(workflow, /run: pnpm native:test/);
  assert.equal(workflow.match(/run: pnpm native:test/g)?.length, 2);
  assert.match(workflow, /run: pnpm desktop:prepare/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.doesNotMatch(workflow, /linux|src-tauri/i);
  assert.match(packageJson.scripts["native:build"], /--locked/);
  assert.match(packageJson.scripts["native:test"], /--locked/);
});
