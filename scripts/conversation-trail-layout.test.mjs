import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const trailMarker = "/* 0025 — conversation root and message trail */";
const trailMarkerIndex = styles.indexOf(trailMarker);
const trailStyles = styles.slice(trailMarkerIndex);

test("conversation trail keeps its root, branch, and avatar geometry aligned", () => {
  assert.ok(
    trailMarkerIndex >= 0,
    "Expected the 0025 conversation-trail style contract",
  );
  assert.match(
    trailStyles,
    /\.conversation-flow\s*\{\s*--conversation-rail-x: 57px;/,
  );
  assert.match(
    trailStyles,
    /\.conversation-thread::before\s*\{[\s\S]*left: var\(--conversation-rail-x\);[\s\S]*width: 1px;/,
  );
  assert.match(
    trailStyles,
    /\.conversation-flow--filled \.message:not\(\.message--grouped\)::after\s*\{[\s\S]*left: 66px;[\s\S]*width: 12px;/,
  );
  assert.match(
    trailStyles,
    /\.conversation-flow--filled \.message--grouped::before\s*\{[\s\S]*left: 42px;[\s\S]*width: 6px;/,
  );
  assert.match(
    trailStyles,
    /\.empty-conversation__spark\s*\{[\s\S]*left: -49px;[\s\S]*width: 32px;/,
  );
});

test("conversation trail has a reduced-motion fallback", () => {
  assert.match(
    trailStyles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.empty-conversation\s*\{\s*animation: none;/,
  );
});
