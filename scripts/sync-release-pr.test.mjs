import assert from "node:assert/strict";
import test from "node:test";

import { syncReleasePullRequest } from "./sync-release-pr.mjs";

const environment = {
  GH_TOKEN: "test-token",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_REPOSITORY: "ayushrameja/bakbak",
  RELEASE_TAG: "v1.0.0",
  RELEASE_VERSION: "1.0.0",
  VERSION_BRANCH: "automation/release-v1.0.0-123-1",
  VERSION_HEAD: "version-head",
};
const silentLogger = { log() {}, warn() {} };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

function pullRequest(overrides = {}) {
  return {
    number: 42,
    state: "open",
    merged_at: null,
    head: { sha: environment.VERSION_HEAD },
    ...overrides,
  };
}

test("creates, verifies, merges, and deletes a release sync branch", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({
      body: options.body ? JSON.parse(options.body) : undefined,
      method: options.method ?? "GET",
      pathname: parsed.pathname,
      search: parsed.search,
    });

    if (parsed.pathname.endsWith("/pulls") && !options.method) {
      return jsonResponse([]);
    }
    if (parsed.pathname.endsWith("/pulls") && options.method === "POST") {
      return jsonResponse(pullRequest());
    }
    if (parsed.pathname.endsWith("/pulls/42") && !options.method) {
      return jsonResponse(pullRequest());
    }
    if (
      parsed.pathname.endsWith("/pulls/42/merge") &&
      options.method === "PUT"
    ) {
      return jsonResponse({ merged: true });
    }
    if (
      parsed.pathname.includes("/git/refs/heads/") &&
      options.method === "DELETE"
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  const number = await syncReleasePullRequest({
    environment,
    fetchImpl,
    logger: silentLogger,
    retryDelayMs: 1,
  });

  assert.equal(number, 42);
  assert.deepEqual(
    calls.map(({ method, pathname }) => [method, pathname]),
    [
      ["GET", "/repos/ayushrameja/bakbak/pulls"],
      ["POST", "/repos/ayushrameja/bakbak/pulls"],
      ["GET", "/repos/ayushrameja/bakbak/pulls/42"],
      ["PUT", "/repos/ayushrameja/bakbak/pulls/42/merge"],
      [
        "DELETE",
        "/repos/ayushrameja/bakbak/git/refs/heads/automation%2Frelease-v1.0.0-123-1",
      ],
    ],
  );
  assert.equal(calls[0].search.includes("head=ayushrameja%3A"), true);
  assert.deepEqual(calls[1].body, {
    base: "main",
    body: "Synchronizes tracked application metadata after publishing v1.0.0.",
    head: environment.VERSION_BRANCH,
    title: "chore(release): sync version to 1.0.0",
  });
  assert.deepEqual(calls[3].body, {
    commit_title: "chore(release): sync version to 1.0.0 [skip ci]",
    commit_message:
      "Synchronizes tracked application metadata after publishing v1.0.0.",
    merge_method: "merge",
    sha: environment.VERSION_HEAD,
  });
});

test("recovers an already-created PR after a retryable create failure", async () => {
  let pullListRequests = 0;
  let createRequests = 0;
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/pulls") && !options.method) {
      pullListRequests += 1;
      return jsonResponse(pullListRequests === 1 ? [] : [pullRequest()]);
    }
    if (parsed.pathname.endsWith("/pulls") && options.method === "POST") {
      createRequests += 1;
      return new Response(null, { status: 500 });
    }
    if (parsed.pathname.endsWith("/pulls/42") && !options.method) {
      return jsonResponse(pullRequest());
    }
    if (parsed.pathname.endsWith("/pulls/42/merge")) {
      return jsonResponse({ merged: true });
    }
    if (parsed.pathname.includes("/git/refs/heads/")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  const number = await syncReleasePullRequest({
    environment,
    fetchImpl,
    logger: silentLogger,
    retryDelayMs: 1,
  });

  assert.equal(number, 42);
  assert.equal(createRequests, 1);
  assert.equal(pullListRequests, 2);
});

test("retries PR creation three times before preserving the branch and failing", async () => {
  let createRequests = 0;
  const delays = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/pulls") && !options.method) {
      return jsonResponse([]);
    }
    if (parsed.pathname.endsWith("/pulls") && options.method === "POST") {
      createRequests += 1;
      return jsonResponse({ message: "temporary failure" }, 502);
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  await assert.rejects(
    syncReleasePullRequest({
      environment,
      fetchImpl,
      logger: silentLogger,
      retryDelayMs: 10,
      sleep: async (milliseconds) => delays.push(milliseconds),
    }),
    /temporary failure/,
  );

  assert.equal(createRequests, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("refuses to merge a PR whose head changed", async () => {
  let mergeRequests = 0;
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/pulls") && !options.method) {
      return jsonResponse([pullRequest({ head: { sha: "unexpected-head" } })]);
    }
    if (parsed.pathname.endsWith("/merge")) {
      mergeRequests += 1;
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  await assert.rejects(
    syncReleasePullRequest({
      environment,
      fetchImpl,
      retryDelayMs: 1,
    }),
    /release sync PR head mismatch/,
  );
  assert.equal(mergeRequests, 0);
});
