import {
  assertPublicHttpsUrl,
  discoverLinkPreview,
  firstMessageUrl,
  MAX_PREVIEW_BYTES,
} from "../../link-preview/preview.ts";
import {
  handleLinkPreviewRequest,
  type LinkPreviewDependencies,
} from "../../link-preview/request.ts";

const MESSAGE_ID = "40000000-0000-4000-8000-000000000001";

Deno.test(
  "link-preview extracts the first text URL and trims punctuation",
  () => {
    assertEquals(
      firstMessageUrl("fallback", [
        { type: "text", text: "See www.example.com/docs." },
        { type: "mention", user_id: "friend", fallback: "Friend" },
      ]),
      "https://www.example.com/docs",
    );
  },
);

Deno.test(
  "link-preview rejects local, private, and non-HTTPS targets",
  async () => {
    await assertRejects(
      () =>
        assertPublicHttpsUrl(new URL("http://example.com"), () =>
          Promise.resolve(["93.184.216.34"]),
        ),
      Error,
      "unsafe_preview_url",
    );
    await assertRejects(
      () =>
        assertPublicHttpsUrl(new URL("https://localhost/"), () =>
          Promise.resolve(["127.0.0.1"]),
        ),
      Error,
      "unsafe_preview_host",
    );
    await assertRejects(
      () =>
        assertPublicHttpsUrl(
          new URL("https://example.com/"),
          (_hostname, family) =>
            Promise.resolve(family === "A" ? ["10.0.0.1"] : []),
        ),
      Error,
      "unsafe_preview_address",
    );
    for (const reserved of ["192.0.2.1", "2001:db8::1", "::ffff:10.0.0.1"]) {
      await assertRejects(
        () =>
          assertPublicHttpsUrl(
            new URL("https://example.com/"),
            (_hostname, family) =>
              Promise.resolve(
                family === (reserved.includes(":") ? "AAAA" : "A")
                  ? [reserved]
                  : [],
              ),
          ),
        Error,
        "unsafe_preview_address",
      );
    }
  },
);

Deno.test(
  "link-preview extracts bounded page and YouTube metadata",
  async () => {
    const html =
      '<meta property="og:title" content="A title"><meta name="description" content="A summary"><meta property="og:site_name" content="Example">';
    const environment = {
      resolve: (_hostname: string, family: "A" | "AAAA") =>
        Promise.resolve(family === "A" ? ["93.184.216.34"] : []),
      fetch: () =>
        Promise.resolve(
          new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ),
    };
    assertEquals(
      await discoverLinkPreview("https://example.com/path", environment),
      {
        kind: "page",
        url: "https://example.com/path",
        title: "A title",
        description: "A summary",
        siteName: "Example",
      },
    );
    assertEquals(
      await discoverLinkPreview(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        environment,
      ),
      {
        kind: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        videoId: "dQw4w9WgXcQ",
        title: "A title",
      },
    );
  },
);

Deno.test(
  "link-preview enforces redirect, response-size, and timeout limits",
  async () => {
    const resolve = (_hostname: string, family: "A" | "AAAA") =>
      Promise.resolve(family === "A" ? ["93.184.216.34"] : []);
    await assertRejects(
      () =>
        discoverLinkPreview("https://example.com", {
          resolve,
          fetch: () =>
            Promise.resolve(
              new Response(null, {
                status: 302,
                headers: { location: "/again" },
              }),
            ),
        }),
      Error,
      "redirect_limit",
    );
    await assertRejects(
      () =>
        discoverLinkPreview("https://example.com", {
          resolve,
          fetch: () =>
            Promise.resolve(
              new Response("x".repeat(MAX_PREVIEW_BYTES + 1), {
                headers: { "content-type": "text/html" },
              }),
            ),
        }),
      Error,
      "preview_too_large",
    );
    await assertRejects(
      () =>
        discoverLinkPreview("https://example.com", {
          resolve,
          timeoutMs: 1,
          fetch: (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new Error("aborted")),
              );
            }),
        }),
      Error,
      "preview_timeout",
    );
  },
);

Deno.test(
  "link-preview authenticates, authorizes, and stores one result",
  async () => {
    const saved: unknown[] = [];
    const dependencies = createDependencies({
      saveResult: (_scope, _messageId, preview) => {
        saved.push(preview);
        return Promise.resolve();
      },
    });
    const unauthorized = await handleLinkPreviewRequest(
      request(),
      createDependencies({ authenticate: () => Promise.resolve(null) }),
    );
    assertEquals(unauthorized.status, 401);

    const missing = await handleLinkPreviewRequest(
      request(),
      createDependencies({ loadMessage: () => Promise.resolve(null) }),
    );
    assertEquals(missing.status, 404);

    const response = await handleLinkPreviewRequest(request(), dependencies);
    assertEquals(response.status, 200);
    assertEquals(saved.length, 1);
    assertEquals((saved[0] as { kind: string }).kind, "page");
  },
);

function createDependencies(
  overrides: Partial<LinkPreviewDependencies> = {},
): LinkPreviewDependencies {
  return {
    allowedOrigins: new Set(["tauri://localhost"]),
    authenticate: () => Promise.resolve({ id: "user-1" }),
    loadMessage: () =>
      Promise.resolve({
        body: "https://example.com",
        content: null,
        messageKind: "member",
        linkPreview: null,
        attemptedAt: null,
      }),
    saveResult: () => Promise.resolve(),
    previewEnvironment: {
      resolve: (_hostname, family) =>
        Promise.resolve(family === "A" ? ["93.184.216.34"] : []),
      fetch: () =>
        Promise.resolve(
          new Response("<title>Example</title>", {
            headers: { "content-type": "text/html" },
          }),
        ),
    },
    now: () => Date.parse("2026-07-24T12:00:00.000Z"),
    ...overrides,
  };
}

function request(): Request {
  return new Request("https://example.test/functions/v1/link-preview", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
      origin: "tauri://localhost",
    },
    body: JSON.stringify({ scope: "channel", messageId: MESSAGE_ID }),
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(
        actual,
      )}.`,
    );
  }
}

async function assertRejects(
  action: () => Promise<unknown>,
  expectedType: typeof Error,
  expectedMessage: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof expectedType && error.message === expectedMessage) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected ${expectedMessage}.`);
}
