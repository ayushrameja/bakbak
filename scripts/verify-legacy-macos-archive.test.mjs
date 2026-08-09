import assert from "node:assert/strict";
import test from "node:test";
import { verifyLegacyMacArchiveEntries } from "./verify-legacy-macos-archive.mjs";

const validEntries = [
  "Bakbak.app/",
  "Bakbak.app/Contents/",
  "Bakbak.app/Contents/Info.plist",
  "Bakbak.app/Contents/MacOS/",
  "Bakbak.app/Contents/MacOS/Bakbak",
  "Bakbak.app/Contents/Resources/app.asar",
];

test("accepts one complete Bakbak application without macOS sidecars", () => {
  assert.deepEqual(verifyLegacyMacArchiveEntries(validEntries), {
    entryCount: validEntries.length,
  });
});

test("rejects AppleDouble and __MACOSX metadata entries", () => {
  assert.throws(
    () =>
      verifyLegacyMacArchiveEntries([
        ...validEntries,
        "Bakbak.app/Contents/Resources/._app.asar",
      ]),
    /forbidden AppleDouble metadata/,
  );
  assert.throws(
    () =>
      verifyLegacyMacArchiveEntries([
        ...validEntries,
        "Bakbak.app/__MACOSX/metadata",
      ]),
    /forbidden AppleDouble metadata/,
  );
});

test("rejects traversal, extra roots, and incomplete app bundles", () => {
  assert.throws(
    () => verifyLegacyMacArchiveEntries([...validEntries, "../Bakbak.app"]),
    /unsafe path/,
  );
  assert.throws(
    () => verifyLegacyMacArchiveEntries([...validEntries, "README.txt"]),
    /unexpected root entry/,
  );
  assert.throws(
    () =>
      verifyLegacyMacArchiveEntries(
        validEntries.filter(
          (entry) => entry !== "Bakbak.app/Contents/MacOS/Bakbak",
        ),
      ),
    /missing Bakbak\.app\/Contents\/MacOS\/Bakbak/,
  );
});
