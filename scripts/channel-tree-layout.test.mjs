import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const treeMarker = "/* 0024 — collapsible channel tree */";
const treeMarkerIndex = styles.indexOf(treeMarker);
const treeStyles = styles.slice(treeMarkerIndex);

test("channel tree keeps its branch geometry and reduced-motion fallback", () => {
  assert.ok(
    treeMarkerIndex >= 0,
    "Expected the 0024 channel-tree style contract",
  );
  assert.match(
    treeStyles,
    /\.channel-group__children \.channel-row-wrap::before\s*\{[\s\S]*border-bottom: 1px solid var\(--glass-line-bright\);[\s\S]*border-left: 1px solid var\(--glass-line-bright\);/,
  );
  assert.match(
    treeStyles,
    /\.channel-group__children \.channel-row-wrap:not\(:last-child\)::after\s*\{[\s\S]*border-left: 1px solid var\(--glass-line-bright\);/,
  );
  assert.match(
    treeStyles,
    /\.channel-group__children \.channel-row-wrap:last-child::before\s*\{\s*border-bottom-left-radius: 8px;/,
  );
  assert.match(
    treeStyles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.channel-group__chevron\s*\{\s*transition: none;[\s\S]*\.channel-group__children\s*\{\s*animation: none;/,
  );
});
