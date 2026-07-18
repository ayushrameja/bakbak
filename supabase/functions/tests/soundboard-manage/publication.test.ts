import { publishAfterObjectUpload } from "../../soundboard-manage/publication.ts";

Deno.test(
  "sound publication leaves a successfully published object intact",
  async () => {
    let removals = 0;
    const result = await publishAfterObjectUpload(
      () => Promise.resolve(),
      () => Promise.resolve("published"),
      () => {
        removals += 1;
        return Promise.resolve();
      },
    );

    assertEquals(result, "published");
    assertEquals(removals, 0);
  },
);

Deno.test(
  "sound publication removes the object when catalog insertion fails",
  async () => {
    let removals = 0;
    await assertRejects(
      publishAfterObjectUpload(
        () => Promise.resolve(),
        () => Promise.reject(new Error("database unavailable")),
        () => {
          removals += 1;
          return Promise.resolve();
        },
      ),
      "database unavailable",
    );
    assertEquals(removals, 1);
  },
);

Deno.test(
  "sound publication does not insert or clean up when storage fails",
  async () => {
    let publications = 0;
    let removals = 0;
    await assertRejects(
      publishAfterObjectUpload(
        () => Promise.reject(new Error("storage unavailable")),
        () => {
          publications += 1;
          return Promise.resolve("not reached");
        },
        () => {
          removals += 1;
          return Promise.resolve();
        },
      ),
      "storage unavailable",
    );
    assertEquals(publications, 0);
    assertEquals(removals, 0);
  },
);

async function assertRejects(
  request: Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await request;
  } catch (caught) {
    if (caught instanceof Error && caught.message === message) return;
    throw caught;
  }
  throw new Error(`Expected rejection "${message}".`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
