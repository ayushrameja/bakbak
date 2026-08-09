import assert from "node:assert/strict";
import test from "node:test";
import { isStableSemver, withPackageVersion } from "./set-version-lib.mjs";

test("accepts stable desktop release versions only", () => {
  assert.equal(isStableSemver("1.6.0"), true);
  assert.equal(isStableSemver("01.6.0"), false);
  assert.equal(isStableSemver("1.6.0-beta.1"), false);
  assert.equal(isStableSemver("main"), false);
});

test("updates package metadata without mutating unrelated Electron config", () => {
  const original = {
    name: "bakbak",
    version: "1.6.0",
    build: { appId: "com.bakbak.desktop" },
  };
  const updated = withPackageVersion(original, "1.7.0");

  assert.equal(updated.version, "1.7.0");
  assert.deepEqual(updated.build, original.build);
  assert.equal(original.version, "1.6.0");
  assert.throws(() => withPackageVersion(original, "1.7"), /stable SemVer/);
});
