import { jsonResponse } from "../_shared/http.ts";

export interface ReleaseAnnouncement {
  repository: "ayushrameja/bakbak";
  historical: boolean;
  release: {
    id: number;
    tag_name: string;
    name: string;
    body: string;
    html_url: string;
    published_at: string;
    draft: boolean;
    prerelease: boolean;
  };
}

export interface SystemEventDependencies {
  secret: string;
  publish: (announcement: ReleaseAnnouncement) => Promise<{ id: string }>;
}

export async function handleSystemEventRequest(
  request: Request,
  dependencies: SystemEventDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, {
      Allow: "POST",
    });
  }
  if (
    !dependencies.secret ||
    !constantTimeEqual(
      request.headers.get("x-bakbak-system-secret") ?? "",
      dependencies.secret,
    )
  ) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const announcement = parseAnnouncement(input);
  if (!announcement) {
    return jsonResponse({ error: "invalid_release" }, 400);
  }
  if (announcement.release.draft || announcement.release.prerelease) {
    return jsonResponse({ error: "stable_releases_only" }, 422);
  }

  try {
    const result = await dependencies.publish(announcement);
    return jsonResponse({ ok: true, messageId: result.id }, 200);
  } catch {
    return jsonResponse({ error: "publication_failed" }, 500);
  }
}

export function plainReleaseNotes(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/(^|\n)\s{0,3}#{1,6}\s*/g, "$1")
    .replace(/(^|\n)\s*[-*+]\s+/g, "$1")
    .replace(/[`*_~>]/g, "")
    .replace(/\r?\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

function parseAnnouncement(value: unknown): ReleaseAnnouncement | null {
  if (!isRecord(value) || value.repository !== "ayushrameja/bakbak") {
    return null;
  }
  const release = value.release;
  if (!isRecord(release)) return null;
  if (
    typeof release.id !== "number" ||
    !Number.isSafeInteger(release.id) ||
    release.id <= 0 ||
    typeof release.tag_name !== "string" ||
    !/^v?\d+\.\d+\.\d+$/.test(release.tag_name) ||
    typeof release.name !== "string" ||
    !release.name.trim() ||
    typeof release.body !== "string" ||
    typeof release.html_url !== "string" ||
    !/^https:\/\/github\.com\/ayushrameja\/bakbak\/releases\/tag\//.test(
      release.html_url,
    ) ||
    typeof release.published_at !== "string" ||
    Number.isNaN(Date.parse(release.published_at)) ||
    typeof release.draft !== "boolean" ||
    typeof release.prerelease !== "boolean" ||
    typeof value.historical !== "boolean"
  ) {
    return null;
  }
  return {
    repository: "ayushrameja/bakbak",
    historical: value.historical,
    release: {
      id: release.id,
      tag_name: release.tag_name.slice(0, 80),
      name: release.name.trim().slice(0, 160),
      body: plainReleaseNotes(release.body),
      html_url: release.html_url,
      published_at: new Date(release.published_at).toISOString(),
      draft: release.draft,
      prerelease: release.prerelease,
    },
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
