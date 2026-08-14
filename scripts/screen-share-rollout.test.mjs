import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderScreenShareRollout } from "./write-screen-share-rollout.mjs";

const root = new URL("../", import.meta.url);
const generated = await readFile(
  new URL("electron/screen-share-rollout.ts", root),
  "utf8",
);
const ci = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");
const release = await readFile(
  new URL(".github/workflows/release.yml", root),
  "utf8",
);
const candidate = await readFile(
  new URL(".github/workflows/stabilization-candidate.yml", root),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);

test("native screen audio is embedded fail-closed by default and for releases", () => {
  assert.match(generated, /NATIVE_SCREEN_AUDIO_ENABLED = false/);
  assert.match(ci, /BAKBAK_NATIVE_SCREEN_AUDIO_CANDIDATE: "false"/);
  assert.match(release, /BAKBAK_NATIVE_SCREEN_AUDIO_CANDIDATE: "false"/);
  assert.match(
    packageJson.scripts["electron:compile"],
    /^node scripts\/write-screen-share-rollout\.mjs && tsc/,
  );
  assert.match(renderScreenShareRollout(undefined), /= false as boolean/);
  assert.match(renderScreenShareRollout("false"), /= false as boolean/);
});

test("only a stabilization candidate embeds the temporary audio gate", () => {
  assert.match(candidate, /BAKBAK_NATIVE_SCREEN_AUDIO_CANDIDATE: "true"/);
  assert.match(renderScreenShareRollout("true"), /= true as boolean/);
  assert.match(renderScreenShareRollout("TRUE"), /= false as boolean/);
});
