import assert from "node:assert/strict";
import test from "node:test";
import {
  isStableSemver,
  lockedBakbakVersion,
  packageVersionFromCargo,
  withCargoPackageVersion,
  withLockedBakbakVersion,
  withPackageVersion,
} from "./set-version-lib.mjs";

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

test("keeps Tauri package and lock metadata on the same release version", () => {
  const cargo =
    '[package]\nname = "bakbak"\nversion = "1.8.1"\n\n[dependencies]\nserde = "1"\n';
  const lock =
    '[[package]]\nname = "bakbak"\nversion = "1.8.1"\ndependencies = []\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n';

  const updatedCargo = withCargoPackageVersion(cargo, "2.0.0");
  const updatedLock = withLockedBakbakVersion(lock, "2.0.0");

  assert.equal(packageVersionFromCargo(updatedCargo), "2.0.0");
  assert.equal(lockedBakbakVersion(updatedLock), "2.0.0");
  assert.match(updatedCargo, /serde = "1"/);
  assert.match(updatedLock, /name = "serde"\nversion = "1\.0\.0"/);
});

for (const newline of ["\n", "\r\n"]) {
  test(`reads and updates Cargo versions with ${JSON.stringify(newline)} line endings`, () => {
    const cargo = [
      "[package]",
      'name = "bakbak"',
      'version = "2.0.0"',
      "",
      "[dependencies]",
      'serde = "1"',
      "",
    ].join(newline);
    const lock = [
      "[[package]]",
      'name = "before"',
      'version = "1.0.0"',
      "",
      "[[package]]",
      'name = "bakbak"',
      'version = "2.0.0"',
      "dependencies = []",
      "",
      "[[package]]",
      'name = "after"',
      'version = "3.0.0"',
      "",
    ].join(newline);
    assert.equal(packageVersionFromCargo(cargo), "2.0.0");
    assert.equal(lockedBakbakVersion(lock), "2.0.0");
    assert.equal(
      withCargoPackageVersion(cargo, "2.0.1"),
      cargo.replace('version = "2.0.0"', 'version = "2.0.1"'),
    );
    assert.equal(
      withLockedBakbakVersion(lock, "2.0.1"),
      lock.replace('version = "2.0.0"', 'version = "2.0.1"'),
    );
  });
}
