import { corsHeaders, isRequestOriginAllowed } from "../_shared/cors.ts";
import { emptyResponse, jsonResponse } from "../_shared/http.ts";
import {
  MAX_SOUNDBOARD_WAV_BYTES,
  validateSoundboardWav,
  WavValidationError,
} from "./wav.ts";

const DEFAULT_EMOJI = "🔊";

export interface AuthenticatedSoundboardUser {
  id: string;
}

export interface SoundboardUploadRequest {
  serverId: string;
  label: string;
  emoji: string;
  clip: Uint8Array;
  durationMs: number;
}

export interface SoundboardManageDependencies {
  allowedOrigins: ReadonlySet<string>;
  authenticate: (
    request: Request,
  ) => Promise<AuthenticatedSoundboardUser | null>;
  uploadSound: (
    user: AuthenticatedSoundboardUser,
    input: SoundboardUploadRequest,
  ) => Promise<unknown>;
  deleteSound: (
    user: AuthenticatedSoundboardUser,
    soundId: string,
  ) => Promise<{ soundId: string; archived: boolean }>;
}

export class SoundboardManageError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "SoundboardManageError";
  }
}

export async function handleSoundboardManageRequest(
  request: Request,
  dependencies: SoundboardManageDependencies,
): Promise<Response> {
  const responseHeaders = corsHeaders(request, dependencies.allowedOrigins);

  if (!isRequestOriginAllowed(request, dependencies.allowedOrigins)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, responseHeaders);
  }

  if (request.method === "OPTIONS") {
    return emptyResponse(204, responseHeaders);
  }

  if (request.method !== "POST") {
    responseHeaders.set("Allow", "POST, OPTIONS");
    return jsonResponse({ error: "method_not_allowed" }, 405, responseHeaders);
  }

  let user: AuthenticatedSoundboardUser | null;
  try {
    user = await dependencies.authenticate(request);
  } catch {
    user = null;
  }
  if (user === null) {
    return jsonResponse({ error: "unauthorized" }, 401, responseHeaders);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const upload = await parseUploadRequest(request);
      const sound = await dependencies.uploadSound(user, upload);
      return jsonResponse({ sound }, 201, responseHeaders);
    }

    if (contentType.includes("application/json")) {
      const soundId = await parseDeleteRequest(request);
      const result = await dependencies.deleteSound(user, soundId);
      return jsonResponse(result, 200, responseHeaders);
    }

    return jsonResponse(
      { error: "unsupported_content_type" },
      415,
      responseHeaders,
    );
  } catch (caught) {
    if (caught instanceof SoundboardManageError) {
      return jsonResponse(
        { error: caught.code },
        caught.status,
        responseHeaders,
      );
    }
    if (caught instanceof WavValidationError) {
      return jsonResponse({ error: caught.code }, 422, responseHeaders);
    }
    return jsonResponse(
      { error: "soundboard_request_failed" },
      500,
      responseHeaders,
    );
  }
}

async function parseUploadRequest(
  request: Request,
): Promise<SoundboardUploadRequest> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new SoundboardManageError("invalid_payload", 400);
  }

  if (form.get("action") !== "upload") {
    throw new SoundboardManageError("invalid_action", 400);
  }

  const serverId = requiredText(form, "serverId");
  if (!isUuid(serverId)) {
    throw new SoundboardManageError("invalid_server_id", 400);
  }

  const label = requiredText(form, "label").trim();
  if (label.length < 1 || label.length > 50) {
    throw new SoundboardManageError("invalid_label", 400);
  }

  const rawEmoji = optionalText(form, "emoji").trim();
  const emoji = rawEmoji || DEFAULT_EMOJI;
  if (Array.from(emoji).length > 16) {
    throw new SoundboardManageError("invalid_emoji", 400);
  }

  const clip = form.get("clip");
  if (!(clip instanceof File)) {
    throw new SoundboardManageError("clip_required", 400);
  }
  if (
    clip.type !== "audio/wav" &&
    clip.type !== "audio/x-wav" &&
    clip.type !== "application/octet-stream"
  ) {
    throw new SoundboardManageError("clip_must_be_wav", 415);
  }
  if (clip.size > MAX_SOUNDBOARD_WAV_BYTES) {
    throw new SoundboardManageError("clip_too_large", 413);
  }

  const bytes = new Uint8Array(await clip.arrayBuffer());
  const { durationMs } = validateSoundboardWav(bytes);
  return { serverId, label, emoji, clip: bytes, durationMs };
}

async function parseDeleteRequest(request: Request): Promise<string> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new SoundboardManageError("invalid_payload", 400);
  }

  if (
    !isRecord(payload) ||
    payload.action !== "delete" ||
    !isUuid(payload.soundId)
  ) {
    throw new SoundboardManageError("invalid_payload", 400);
  }
  return payload.soundId;
}

function requiredText(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string") {
    throw new SoundboardManageError("invalid_payload", 400);
  }
  return value;
}

function optionalText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
