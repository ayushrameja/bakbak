import {
  handleSoundboardManageRequest,
  SoundboardManageError,
  type SoundboardManageDependencies,
  type SoundboardUploadRequest,
} from "../../soundboard-manage/handler.ts";
import { makeWav } from "./fixtures.ts";

const SERVER_ID = "00000000-0000-4000-8000-000000000001";
const SOUND_ID = "00000000-0000-4000-8000-000000003001";
const USER_ID = "10000000-0000-4000-8000-000000000001";

Deno.test(
  "soundboard-manage answers allowed preflight without authentication",
  async () => {
    const response = await handleSoundboardManageRequest(
      new Request("https://example.test/functions/v1/soundboard-manage", {
        method: "OPTIONS",
        headers: { origin: "tauri://localhost" },
      }),
      createDependencies(),
    );
    assertEquals(response.status, 204);
  },
);

Deno.test(
  "soundboard-manage rejects untrusted origins and missing users",
  async () => {
    const badOrigin = await handleSoundboardManageRequest(
      makeDeleteRequest({ origin: "https://evil.example" }),
      createDependencies(),
    );
    assertEquals(badOrigin.status, 403);
    assertEquals(await readError(badOrigin), "origin_not_allowed");

    const unauthorized = await handleSoundboardManageRequest(
      makeDeleteRequest(),
      createDependencies({ authenticate: () => Promise.resolve(null) }),
    );
    assertEquals(unauthorized.status, 401);
    assertEquals(await readError(unauthorized), "unauthorized");
  },
);

Deno.test(
  "soundboard-manage rejects unsupported methods and content types",
  async () => {
    const method = await handleSoundboardManageRequest(
      new Request("https://example.test/functions/v1/soundboard-manage", {
        method: "DELETE",
        headers: { origin: "tauri://localhost" },
      }),
      createDependencies(),
    );
    assertEquals(method.status, 405);
    assertEquals(await readError(method), "method_not_allowed");

    const content = await handleSoundboardManageRequest(
      new Request("https://example.test/functions/v1/soundboard-manage", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "text/plain",
          origin: "tauri://localhost",
        },
        body: "nope",
      }),
      createDependencies(),
    );
    assertEquals(content.status, 415);
    assertEquals(await readError(content), "unsupported_content_type");
  },
);

Deno.test(
  "soundboard-manage validates and forwards normalized WAV uploads",
  async () => {
    const uploads: SoundboardUploadRequest[] = [];
    const response = await handleSoundboardManageRequest(
      makeUploadRequest(makeWav(4_250), { emoji: "" }),
      createDependencies({
        uploadSound: (_user, input) => {
          uploads.push(input);
          return Promise.resolve({ id: SOUND_ID });
        },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    assertEquals(response.status, 201);
    assertEquals((body.sound as Record<string, unknown>).id, SOUND_ID);
    assertEquals(uploads[0]?.serverId, SERVER_ID);
    assertEquals(uploads[0]?.label, "Excellent timing");
    assertEquals(uploads[0]?.emoji, "🔊");
    assertEquals(uploads[0]?.durationMs, 4_250);
  },
);

Deno.test(
  "soundboard-manage rejects malformed and overlong audio before publication",
  async () => {
    let uploadCalls = 0;
    const dependencies = createDependencies({
      uploadSound: () => {
        uploadCalls += 1;
        return Promise.resolve({});
      },
    });
    const malformed = await handleSoundboardManageRequest(
      makeUploadRequest(new TextEncoder().encode("definitely-not-wave")),
      dependencies,
    );
    assertEquals(malformed.status, 422);
    assertEquals(await readError(malformed), "invalid_wav");

    const overlong = await handleSoundboardManageRequest(
      makeUploadRequest(makeWav(5_001)),
      dependencies,
    );
    assertEquals(overlong.status, 422);
    assertEquals(await readError(overlong), "clip_duration_out_of_range");
    assertEquals(uploadCalls, 0);
  },
);

Deno.test(
  "soundboard-manage surfaces member and server quota conflicts",
  async () => {
    const response = await handleSoundboardManageRequest(
      makeUploadRequest(makeWav(1_000)),
      createDependencies({
        uploadSound: () =>
          Promise.reject(new SoundboardManageError("member_upload_limit", 409)),
      }),
    );
    assertEquals(response.status, 409);
    assertEquals(await readError(response), "member_upload_limit");
  },
);

Deno.test("soundboard-manage routes authenticated owner deletion", async () => {
  const deleted: string[] = [];
  const response = await handleSoundboardManageRequest(
    makeDeleteRequest(),
    createDependencies({
      deleteSound: (_user, soundId) => {
        deleted.push(soundId);
        return Promise.resolve({ soundId, archived: false });
      },
    }),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assertEquals(response.status, 200);
  assertEquals(deleted[0], SOUND_ID);
  assertEquals(body.archived, false);
});

Deno.test(
  "soundboard-manage returns normalized moderation denial",
  async () => {
    const response = await handleSoundboardManageRequest(
      makeDeleteRequest(),
      createDependencies({
        deleteSound: () =>
          Promise.reject(
            new SoundboardManageError("sound_delete_forbidden", 403),
          ),
      }),
    );
    assertEquals(response.status, 403);
    assertEquals(await readError(response), "sound_delete_forbidden");
  },
);

function createDependencies(
  overrides: Partial<SoundboardManageDependencies> = {},
): SoundboardManageDependencies {
  return {
    allowedOrigins: new Set(["tauri://localhost"]),
    authenticate: () => Promise.resolve({ id: USER_ID }),
    uploadSound: () => Promise.resolve({ id: SOUND_ID }),
    deleteSound: (_user, soundId) =>
      Promise.resolve({ soundId, archived: false }),
    ...overrides,
  };
}

function makeUploadRequest(
  bytes: Uint8Array,
  input: { emoji?: string } = {},
): Request {
  const form = new FormData();
  form.set("action", "upload");
  form.set("serverId", SERVER_ID);
  form.set("label", "Excellent timing");
  form.set("emoji", input.emoji ?? "🎯");
  form.set(
    "clip",
    new File([Uint8Array.from(bytes).buffer], "clip.wav", {
      type: "audio/wav",
    }),
  );
  return new Request("https://example.test/functions/v1/soundboard-manage", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      origin: "tauri://localhost",
    },
    body: form,
  });
}

function makeDeleteRequest(
  additionalHeaders: Record<string, string> = {},
): Request {
  return new Request("https://example.test/functions/v1/soundboard-manage", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      origin: "tauri://localhost",
      ...additionalHeaders,
    },
    body: JSON.stringify({ action: "delete", soundId: SOUND_ID }),
  });
}

async function readError(response: Response): Promise<unknown> {
  const body = (await response.json()) as Record<string, unknown>;
  return body.error;
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
