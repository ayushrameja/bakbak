import assert from "node:assert/strict";
import test from "node:test";
import {
  findCargoLockVersion,
  replaceCargoLockVersion,
} from "./set-version-lib.mjs";

for (const [name, newline] of [
  ["LF", "\n"],
  ["CRLF", "\r\n"],
]) {
  test(`reads and updates a Cargo lockfile with ${name} line endings`, () => {
    const cargoLock = [
      "version = 4",
      "",
      "[[package]]",
      'name = "bakbak"',
      'version = "0.3.0"',
      "dependencies = []",
      "",
    ].join(newline);

    assert.equal(findCargoLockVersion(cargoLock), "0.3.0");

    const updated = replaceCargoLockVersion(cargoLock, "0.4.0");
    assert.equal(findCargoLockVersion(updated), "0.4.0");
    assert.equal(updated.includes(newline), true);
    assert.equal(updated.replaceAll(newline, "").includes("\n"), false);
    assert.equal(updated.replaceAll(newline, "").includes("\r"), false);
  });
}
