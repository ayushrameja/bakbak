import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const conversationMarker =
  "/* 0029 — simple conversations and unambiguous selected channels */";
const conversationMarkerIndex = styles.indexOf(conversationMarker);
const conversationStyles = styles.slice(conversationMarkerIndex);

test("conversations keep simple empty copy and circular chat-only avatars", () => {
  assert.ok(
    conversationMarkerIndex >= 0,
    "Expected the 0029 simple-conversation style contract",
  );
  assert.match(
    conversationStyles,
    /\.empty-conversation\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*color-mix/,
  );
  assert.match(
    conversationStyles,
    /\.message__profile-avatar,[\s\S]*\.message__profile-avatar \.avatar,[\s\S]*\.message > \.avatar\s*\{\s*border-radius:\s*50%;/,
  );
  assert.doesNotMatch(
    styles,
    /\.conversation-thread::before|\.conversation-thread__end|\.conversation-flow--filled|\.conversation-flow--empty/,
  );
  assert.doesNotMatch(
    styles,
    /\.channel-intro__state|\.empty-conversation__spark|\.empty-conversation::before/,
  );
});
