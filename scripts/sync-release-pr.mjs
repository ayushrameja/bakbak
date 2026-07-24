import { pathToFileURL } from "node:url";

const githubApiVersion = "2022-11-28";
const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

export class GitHubRequestError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "GitHubRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

function requiredEnvironment(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isRetryable(error) {
  return (
    error instanceof GitHubRequestError &&
    (error.retryable ||
      error.status === 0 ||
      retryableStatuses.has(error.status))
  );
}

function assertExpectedHead(pullRequest, expectedHead) {
  const actualHead = pullRequest?.head?.sha;
  if (actualHead !== expectedHead) {
    throw new Error(
      `release sync PR head mismatch: expected ${expectedHead}, received ${actualHead ?? "none"}`,
    );
  }
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) {
    if (response.status === 204) {
      return undefined;
    }
    throw new GitHubRequestError(
      `GitHub returned an empty response with status ${response.status}`,
      { status: response.status, retryable: true },
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new GitHubRequestError(
      `GitHub returned malformed JSON with status ${response.status}`,
      { status: response.status, retryable: true },
    );
  }
}

function createGitHubClient({ apiUrl, fetchImpl, token }) {
  return async function request(path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${apiUrl}${path}`, {
        ...options,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "bakbak-release-sync",
          "X-GitHub-Api-Version": githubApiVersion,
          ...options.headers,
        },
      });
    } catch (error) {
      throw new GitHubRequestError(
        `GitHub request failed: ${error instanceof Error ? error.message : String(error)}`,
        { retryable: true },
      );
    }

    const payload = await readResponse(response);
    if (!response.ok) {
      const message =
        payload?.message ??
        `GitHub request failed with status ${response.status}`;
      throw new GitHubRequestError(message, {
        status: response.status,
        retryable: retryableStatuses.has(response.status),
      });
    }
    return payload;
  };
}

async function findOpenPullRequest({ branch, owner, repository, request }) {
  const query = new URLSearchParams({
    state: "open",
    base: "main",
    head: `${owner}:${branch}`,
    per_page: "1",
  });
  const pullRequests = await request(
    `/repos/${repository}/pulls?${query.toString()}`,
  );
  if (!Array.isArray(pullRequests)) {
    throw new GitHubRequestError(
      "GitHub returned an invalid pull request list",
      { retryable: true },
    );
  }
  return pullRequests[0];
}

async function recoverPullRequest(context) {
  try {
    return await findOpenPullRequest(context);
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }
    return undefined;
  }
}

async function ensurePullRequest(context) {
  let lastError;
  for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
    try {
      const existing = await findOpenPullRequest(context);
      if (existing) {
        assertExpectedHead(existing, context.versionHead);
        return existing;
      }

      const created = await context.request(
        `/repos/${context.repository}/pulls`,
        {
          method: "POST",
          body: JSON.stringify({
            base: "main",
            body: `Synchronizes tracked application metadata after publishing ${context.releaseTag}.`,
            head: context.branch,
            title: `chore(release): sync version to ${context.releaseVersion}`,
          }),
        },
      );
      assertExpectedHead(created, context.versionHead);
      return created;
    } catch (error) {
      lastError = error;
      const recovered = await recoverPullRequest(context);
      if (recovered) {
        assertExpectedHead(recovered, context.versionHead);
        return recovered;
      }

      const mayRetry =
        isRetryable(error) ||
        (error instanceof GitHubRequestError && error.status === 422);
      if (!mayRetry || attempt === context.maxAttempts) {
        throw error;
      }

      context.logger.warn(
        `release sync PR creation attempt ${attempt} failed; retrying`,
      );
      await context.sleep(context.retryDelayMs * attempt);
    }
  }
  throw lastError;
}

async function getPullRequest(context, number) {
  return context.request(`/repos/${context.repository}/pulls/${number}`);
}

async function recoverMergedPullRequest(context, number) {
  try {
    const pullRequest = await getPullRequest(context, number);
    assertExpectedHead(pullRequest, context.versionHead);
    return pullRequest.merged_at ? pullRequest : undefined;
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }
    return undefined;
  }
}

async function ensureMerged(context, pullRequest) {
  for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
    try {
      const current = await getPullRequest(context, pullRequest.number);
      assertExpectedHead(current, context.versionHead);
      if (current.merged_at) {
        return current;
      }
      if (current.state !== "open") {
        throw new Error(
          `release sync PR #${pullRequest.number} is closed without a merge`,
        );
      }

      const result = await context.request(
        `/repos/${context.repository}/pulls/${pullRequest.number}/merge`,
        {
          method: "PUT",
          body: JSON.stringify({
            commit_title: `chore(release): sync version to ${context.releaseVersion} [skip ci]`,
            commit_message: `Synchronizes tracked application metadata after publishing ${context.releaseTag}.`,
            merge_method: "merge",
            sha: context.versionHead,
          }),
        },
      );
      if (result?.merged === true) {
        return result;
      }
      throw new GitHubRequestError(
        result?.message ?? "GitHub did not merge the release sync PR",
        { status: 409 },
      );
    } catch (error) {
      const recovered = await recoverMergedPullRequest(
        context,
        pullRequest.number,
      );
      if (recovered) {
        return recovered;
      }
      if (!isRetryable(error) || attempt === context.maxAttempts) {
        throw error;
      }

      context.logger.warn(
        `release sync PR merge attempt ${attempt} failed; retrying`,
      );
      await context.sleep(context.retryDelayMs * attempt);
    }
  }
  throw new Error(`could not merge release sync PR #${pullRequest.number}`);
}

async function deleteBranch(context) {
  const encodedBranch = encodeURIComponent(context.branch);
  for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
    try {
      await context.request(
        `/repos/${context.repository}/git/refs/heads/${encodedBranch}`,
        { method: "DELETE" },
      );
      return;
    } catch (error) {
      if (error instanceof GitHubRequestError && error.status === 404) {
        return;
      }
      if (!isRetryable(error) || attempt === context.maxAttempts) {
        throw error;
      }

      context.logger.warn(
        `release sync branch deletion attempt ${attempt} failed; retrying`,
      );
      await context.sleep(context.retryDelayMs * attempt);
    }
  }
}

export async function syncReleasePullRequest({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  maxAttempts = 3,
  retryDelayMs = 5_000,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const repository = requiredEnvironment(environment, "GITHUB_REPOSITORY");
  const [owner, name, ...rest] = repository.split("/");
  if (!owner || !name || rest.length > 0) {
    throw new Error(`invalid GITHUB_REPOSITORY: ${repository}`);
  }

  const apiUrl = (
    environment.GITHUB_API_URL?.trim() || "https://api.github.com"
  ).replace(/\/$/, "");
  const context = {
    branch: requiredEnvironment(environment, "VERSION_BRANCH"),
    logger,
    maxAttempts,
    owner,
    releaseTag: requiredEnvironment(environment, "RELEASE_TAG"),
    releaseVersion: requiredEnvironment(environment, "RELEASE_VERSION"),
    repository,
    retryDelayMs,
    sleep,
    versionHead: requiredEnvironment(environment, "VERSION_HEAD"),
  };
  context.request = createGitHubClient({
    apiUrl,
    fetchImpl,
    token:
      environment.GH_TOKEN?.trim() ||
      requiredEnvironment(environment, "GITHUB_TOKEN"),
  });

  const pullRequest = await ensurePullRequest(context);
  await ensureMerged(context, pullRequest);
  await deleteBranch(context);
  logger.log(
    `Synchronized ${context.releaseTag} through pull request #${pullRequest.number}.`,
  );
  return pullRequest.number;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  syncReleasePullRequest().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
