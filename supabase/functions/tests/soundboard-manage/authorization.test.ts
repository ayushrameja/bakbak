import { canManageSound } from "../../soundboard-manage/authorization.ts";

Deno.test("sound management allows uploaders and server admins", () => {
  assertEquals(canManageSound("owner", "owner", "member"), true);
  assertEquals(canManageSound("owner", "admin", "admin"), true);
  assertEquals(canManageSound(null, "admin", "admin"), true);
});

Deno.test(
  "sound management denies another member and operator-sound edits",
  () => {
    assertEquals(canManageSound("owner", "other", "member"), false);
    assertEquals(canManageSound(null, "other", "member"), false);
  },
);

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
