import {
  handleMessageMediaRequest,
  type MessageMediaDependencies,
  type ReserveInput,
} from "../../message-media-manage/request.ts";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_ID = "20000000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "30000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "40000000-0000-4000-8000-000000000001";

Deno.test(
  "message-media-manage authenticates and validates target reservations",
  async () => {
    const unauthorized = await handleMessageMediaRequest(
      request({ action: "cleanup" }),
      dependencies({ authenticate: () => Promise.resolve(null) }),
    );
    assertEquals(unauthorized.status, 401);

    const inputs: ReserveInput[] = [];
    const reserved = await handleMessageMediaRequest(
      request({
        action: "reserve",
        targetKind: "channel",
        targetId: TARGET_ID,
        kind: "image",
        mimeType: "image/png",
        byteSize: 1024,
        posterByteSize: 256,
        width: 800,
        height: 600,
        durationMs: null,
      }),
      dependencies({
        reserve: (_user, input) => {
          inputs.push(input);
          return Promise.resolve({
            attachmentId: ATTACHMENT_ID,
            token: "signed",
          });
        },
      }),
    );
    assertEquals(reserved.status, 201);
    assertEquals(inputs[0]?.targetKind, "channel");
    assertEquals(inputs[0]?.width, 800);
  },
);

Deno.test(
  "message-media-manage rejects media outside balanced server limits",
  async () => {
    const oversizedImage = await handleMessageMediaRequest(
      request({
        action: "reserve",
        targetKind: "direct",
        targetId: TARGET_ID,
        kind: "image",
        mimeType: "image/webp",
        byteSize: 1024,
        posterByteSize: 256,
        width: 5000,
        height: 5000,
        durationMs: null,
      }),
      dependencies(),
    );
    assertEquals(oversizedImage.status, 422);
    assertEquals(await errorCode(oversizedImage), "media_too_large");

    const incompatibleVideoSize = await handleMessageMediaRequest(
      request({
        action: "reserve",
        targetKind: "channel",
        targetId: TARGET_ID,
        kind: "video",
        mimeType: "video/mp4",
        byteSize: 1024,
        posterByteSize: 256,
        width: 3840,
        height: 2160,
        durationMs: 10_000,
      }),
      dependencies(),
    );
    assertEquals(incompatibleVideoSize.status, 422);
  },
);

Deno.test(
  "message-media-manage routes cancellation, cleanup, deletion, and quota conflicts",
  async () => {
    const calls: string[] = [];
    const deps = dependencies({
      cancel: (_user, id) => {
        calls.push(`cancel:${id}`);
        return Promise.resolve({ cancelled: true });
      },
      cleanup: () => {
        calls.push("cleanup");
        return Promise.resolve({ cleaned: 2 });
      },
      deleteMessage: (_user, kind, id) => {
        calls.push(`delete:${kind}:${id}`);
        return Promise.resolve({ deleted: true });
      },
    });
    assertEquals(
      (
        await handleMessageMediaRequest(
          request({ action: "cancel", attachmentId: ATTACHMENT_ID }),
          deps,
        )
      ).status,
      200,
    );
    assertEquals(
      (await handleMessageMediaRequest(request({ action: "cleanup" }), deps))
        .status,
      200,
    );
    assertEquals(
      (
        await handleMessageMediaRequest(
          request({
            action: "delete-message",
            messageKind: "direct",
            messageId: MESSAGE_ID,
          }),
          deps,
        )
      ).status,
      200,
    );
    assertEquals(
      calls.join(","),
      `cancel:${ATTACHMENT_ID},cleanup,delete:direct:${MESSAGE_ID}`,
    );

    const conflict = await handleMessageMediaRequest(
      request({
        action: "reserve",
        targetKind: "channel",
        targetId: TARGET_ID,
        kind: "gif",
        mimeType: "image/gif",
        byteSize: 1024,
        posterByteSize: 256,
        width: 100,
        height: 100,
        durationMs: null,
      }),
      dependencies({
        reserve: () => Promise.reject(new Error("member_media_limit")),
      }),
    );
    assertEquals(conflict.status, 409);
    assertEquals(await errorCode(conflict), "member_media_limit");
  },
);

function dependencies(
  overrides: Partial<MessageMediaDependencies> = {},
): MessageMediaDependencies {
  return {
    allowedOrigins: new Set(["tauri://localhost"]),
    authenticate: () => Promise.resolve({ id: USER_ID }),
    reserve: () => Promise.resolve({ attachmentId: ATTACHMENT_ID }),
    cancel: () => Promise.resolve({ cancelled: true }),
    cleanup: () => Promise.resolve({ cleaned: 0 }),
    deleteMessage: () => Promise.resolve({ deleted: true }),
    ...overrides,
  };
}

function request(body: Record<string, unknown>): Request {
  return new Request("https://example.test/functions/v1/message-media-manage", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      origin: "tauri://localhost",
    },
    body: JSON.stringify(body),
  });
}

async function errorCode(response: Response): Promise<unknown> {
  return ((await response.json()) as Record<string, unknown>).error;
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
