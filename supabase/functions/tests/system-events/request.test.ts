import {
  handleSystemEventRequest,
  type ReleaseAnnouncement,
} from "../../system-events/request.ts";

const release = {
  repository: "ayushrameja/bakbak",
  historical: false,
  release: {
    id: 27,
    tag_name: "v0.17.0",
    name: "Bakbak v0.17.0",
    body: "## New\n- [System rooms](https://example.test) are here.",
    html_url: "https://github.com/ayushrameja/bakbak/releases/tag/v0.17.0",
    published_at: "2026-07-24T12:00:00.000Z",
    draft: false,
    prerelease: false,
  },
};

Deno.test(
  "system-events requires its narrow secret and sanitizes releases",
  async () => {
    const unauthorized = await handleSystemEventRequest(
      request(release, "wrong"),
      {
        secret: "correct",
        publish: () => Promise.resolve({ id: "message-1" }),
      },
    );
    assertEquals(unauthorized.status, 401);

    const published: ReleaseAnnouncement[] = [];
    const response = await handleSystemEventRequest(
      request(release, "correct"),
      {
        secret: "correct",
        publish: (announcement) => {
          published.push(announcement);
          return Promise.resolve({ id: "message-1" });
        },
      },
    );
    assertEquals(response.status, 200);
    assertEquals(published[0]?.release.body, "New\nSystem rooms are here.");
  },
);

Deno.test(
  "system-events rejects drafts, prereleases, and other repositories",
  async () => {
    for (const payload of [
      { ...release, release: { ...release.release, draft: true } },
      { ...release, release: { ...release.release, prerelease: true } },
      { ...release, repository: "someone/else" },
    ]) {
      const response = await handleSystemEventRequest(
        request(payload, "correct"),
        {
          secret: "correct",
          publish: () => Promise.resolve({ id: "message-1" }),
        },
      );
      assertEquals(response.status >= 400, true);
    }
  },
);

function request(body: unknown, secret: string): Request {
  return new Request("https://example.test/functions/v1/system-events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bakbak-system-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(
        actual,
      )}.`,
    );
  }
}
