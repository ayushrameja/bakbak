import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const changesJob = workflow.slice(
  workflow.indexOf("  changes:"),
  workflow.indexOf("  validate:"),
);
const windowsJob = workflow.slice(workflow.indexOf("  windows-native:"));

test("Windows native CI runs only for native/workflow changes or manual dispatch", () => {
  assert.match(changesJob, /fetch-depth: 0/);
  assert.match(changesJob, /EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(
    changesJob,
    /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.match(
    changesJob,
    /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
  );
  assert.match(
    changesJob,
    /if \[\[ "\$EVENT_NAME" == "workflow_dispatch" \]\] \|\|/,
  );
  assert.match(
    changesJob,
    /git diff --quiet "\$BASE_SHA" "\$HEAD_SHA" -- \\\n\s+src-tauri \\\n\s+\.github\/workflows\/ci\.yml/,
  );
  assert.match(
    changesJob,
    /windows-native: \$\{\{ steps\.windows-native\.outputs\.required \}\}/,
  );
  assert.match(windowsJob, /needs: changes/);
  assert.match(
    windowsJob,
    /if: needs\.changes\.outputs\.windows-native == 'true'/,
  );
});
