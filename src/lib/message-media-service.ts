import { Upload } from "tus-js-client";
import { appConfig } from "./env";
import { BakbakCache } from "./local-cache";
import { getSupabaseClient } from "./supabase";
import type { MessageScope, StagedMessageAttachment } from "./types";

const mediaCache = new BakbakCache();
const POSTER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type MessageMediaFailure =
  | "offline"
  | "unauthenticated"
  | "forbidden"
  | "missing"
  | "invalid"
  | "decode"
  | "transient";

export class MessageMediaRetrievalError extends Error {
  readonly name = "MessageMediaRetrievalError";

  constructor(
    readonly failure: MessageMediaFailure,
    readonly diagnostic: string,
    options?: ErrorOptions,
  ) {
    super(messageForMediaFailure(failure), options);
  }
}

export interface MessagePosterDownloadOptions {
  refresh?: boolean;
}

interface ReservedAttachment {
  attachmentId: string;
  objectPath: string;
  posterPath: string;
  objectToken: string;
  posterToken: string;
}

export async function uploadMessageAttachments(
  targetKind: MessageScope,
  targetId: string,
  attachments: readonly StagedMessageAttachment[],
  onProgress: (attachmentId: string, progress: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const published: ReservedAttachment[] = [];
  try {
    for (const attachment of attachments) {
      signal?.throwIfAborted();
      const reservation = await reserveAttachment(
        targetKind,
        targetId,
        attachment,
      );
      published.push(reservation);
      await uploadSignedObject(
        attachment.file,
        reservation.objectPath,
        reservation.objectToken,
        attachment.file.type,
        (progress) => onProgress(attachment.id, progress * 0.9),
        signal,
      );
      await uploadSignedObject(
        attachment.poster,
        reservation.posterPath,
        reservation.posterToken,
        "image/webp",
        (progress) => onProgress(attachment.id, 0.9 + progress * 0.1),
        signal,
      );
      onProgress(attachment.id, 1);
    }
    return published.map((reservation) => reservation.attachmentId);
  } catch (error) {
    await Promise.all(
      published.map((reservation) =>
        cancelMessageAttachment(reservation.attachmentId).catch(
          () => undefined,
        ),
      ),
    );
    throw error;
  }
}

export async function cancelMessageAttachment(
  attachmentId: string,
): Promise<void> {
  await invokeMediaFunction({
    action: "cancel",
    attachmentId,
  });
}

export async function cleanupStaleMessageAttachments(): Promise<void> {
  await invokeMediaFunction({ action: "cleanup" });
}

export async function deleteRichMessage(
  messageKind: MessageScope,
  messageId: string,
): Promise<void> {
  await invokeMediaFunction({
    action: "delete-message",
    messageKind,
    messageId,
  });
}

export async function downloadMessageMedia(path: string): Promise<Blob> {
  const userId = await requireCurrentUserId();
  const data = await downloadPrivateMedia(path);
  await assertCurrentUser(userId);
  return data;
}

export async function downloadMessagePoster(
  path: string,
  options: MessagePosterDownloadOptions = {},
): Promise<Blob> {
  const userId = await requireCurrentUserId();
  if (options.refresh) {
    await mediaCache.evictMessageMedia(userId, "message-media", path);
  } else {
    const cached = await mediaCache.readMessageMedia(
      userId,
      "message-media",
      path,
    );
    if (cached) {
      try {
        await validateMessagePoster(cached);
        await assertCurrentUser(userId);
        return cached;
      } catch (error) {
        await mediaCache.evictMessageMedia(userId, "message-media", path);
        if (!(error instanceof MessageMediaRetrievalError)) throw error;
      }
    }
  }

  const data = await downloadPrivateMedia(path);
  await validateMessagePoster(data);
  await assertCurrentUser(userId);
  await mediaCache.writeMessageMedia(userId, "message-media", path, data);
  return data;
}

export async function validateMessagePoster(
  blob: Blob,
  decode: (blob: Blob) => Promise<void> = decodePoster,
): Promise<void> {
  if (blob.size < 1 || !POSTER_TYPES.has(normalizeMimeType(blob.type))) {
    throw new MessageMediaRetrievalError(
      "invalid",
      "message-poster:invalid-blob",
    );
  }
  try {
    await decode(blob);
  } catch (error) {
    if (error instanceof MessageMediaRetrievalError) throw error;
    throw new MessageMediaRetrievalError(
      "decode",
      "message-poster:decode-failed",
      { cause: error },
    );
  }
}

export function messageMediaDiagnostic(error: unknown): {
  message: string;
  diagnostic: string;
} {
  if (error instanceof MessageMediaRetrievalError) {
    return { message: error.message, diagnostic: error.diagnostic };
  }
  return {
    message: messageForMediaFailure("transient"),
    diagnostic: "message-media:transient",
  };
}

async function downloadPrivateMedia(path: string): Promise<Blob> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new MessageMediaRetrievalError("offline", "message-media:offline");
  }
  let result: { data: Blob | null; error: unknown };
  try {
    result = await getSupabaseClient()
      .storage.from("message-media")
      .download(path);
  } catch (error) {
    throw classifyMediaFailure(error);
  }
  if (result.error) throw classifyMediaFailure(result.error);
  if (!result.data) {
    throw new MessageMediaRetrievalError(
      "missing",
      "message-media:missing-object",
    );
  }
  return result.data;
}

async function requireCurrentUserId(): Promise<string> {
  let sessionResult: Awaited<
    ReturnType<ReturnType<typeof getSupabaseClient>["auth"]["getSession"]>
  >;
  try {
    sessionResult = await getSupabaseClient().auth.getSession();
  } catch (error) {
    throw classifyMediaFailure(error);
  }
  if (sessionResult.error || !sessionResult.data.session?.user.id) {
    throw new MessageMediaRetrievalError(
      "unauthenticated",
      "message-media:unauthenticated",
      sessionResult.error ? { cause: sessionResult.error } : undefined,
    );
  }
  return sessionResult.data.session.user.id;
}

async function assertCurrentUser(expectedUserId: string): Promise<void> {
  if ((await requireCurrentUserId()) === expectedUserId) return;
  throw new MessageMediaRetrievalError(
    "unauthenticated",
    "message-media:session-changed",
  );
}

async function decodePoster(blob: Blob): Promise<void> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width < 1 || bitmap.height < 1) {
        throw new Error("Decoded poster has no pixels.");
      }
    } finally {
      bitmap.close();
    }
    return;
  }
  if (
    typeof Image === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new Error("No image decoder is available.");
  }
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? resolve()
          : reject(new Error("Decoded poster has no pixels."));
      image.onerror = () => reject(new Error("Poster decoding failed."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function classifyMediaFailure(error: unknown): MessageMediaRetrievalError {
  if (error instanceof MessageMediaRetrievalError) return error;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new MessageMediaRetrievalError("offline", "message-media:offline", {
      cause: error,
    });
  }
  const status = mediaErrorStatus(error);
  if (status === 401) {
    return new MessageMediaRetrievalError(
      "unauthenticated",
      "message-media:storage-401",
      { cause: error },
    );
  }
  if (status === 403) {
    return new MessageMediaRetrievalError(
      "forbidden",
      "message-media:storage-403",
      { cause: error },
    );
  }
  if (status === 404) {
    return new MessageMediaRetrievalError(
      "missing",
      "message-media:storage-404",
      { cause: error },
    );
  }
  return new MessageMediaRetrievalError(
    "transient",
    "message-media:transport-failed",
    { cause: error },
  );
}

function mediaErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  for (const value of [error.status, error.statusCode, error.status_code]) {
    const status = typeof value === "string" ? Number(value) : value;
    if (typeof status === "number" && Number.isFinite(status)) return status;
  }
  return null;
}

function normalizeMimeType(type: string): string {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function messageForMediaFailure(failure: MessageMediaFailure): string {
  const messages: Record<MessageMediaFailure, string> = {
    offline: "You're offline. Reconnect, then retry this image.",
    unauthenticated: "Your session expired. Sign in again, then retry.",
    forbidden: "You no longer have access to this private image.",
    missing: "This image is missing from private storage.",
    invalid: "Private storage returned an empty or unsupported image.",
    decode: "The downloaded image could not be decoded.",
    transient: "Private storage did not respond. Retry this image.",
  };
  return messages[failure];
}

async function reserveAttachment(
  targetKind: MessageScope,
  targetId: string,
  attachment: StagedMessageAttachment,
): Promise<ReservedAttachment> {
  return await invokeMediaFunction<ReservedAttachment>({
    action: "reserve",
    targetKind,
    targetId,
    kind: attachment.kind,
    mimeType: attachment.file.type,
    byteSize: attachment.file.size,
    posterByteSize: attachment.poster.size,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
  });
}

async function uploadSignedObject(
  file: Blob,
  objectPath: string,
  signature: string,
  contentType: string,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const endpoint = signedResumableEndpoint(appConfig.supabaseUrl);
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      headers: signedResumableHeaders(appConfig.supabaseAnonKey, signature),
      metadata: {
        bucketName: "message-media",
        objectName: objectPath,
        contentType,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: (error) => reject(readableTusUploadError(error)),
    });
    const abort = () => {
      void upload.abort(true);
      reject(new DOMException("Upload cancelled.", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    upload.start();
  });
}

export function signedResumableEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    url.hostname = url.hostname.replace(
      /\.supabase\.co$/,
      ".storage.supabase.co",
    );
  }
  url.pathname = "/storage/v1/upload/resumable/sign";
  url.search = "";
  return url.toString();
}

export function signedResumableHeaders(
  publicKey: string,
  signature: string,
): Record<string, string> {
  return {
    apikey: publicKey,
    "x-signature": signature,
  };
}

export function readableTusUploadError(error: unknown): Error {
  const response = isRecord(error) ? error.originalResponse : null;
  const status = hasTusResponseStatus(response) ? response.getStatus() : null;
  if (status === 401 || status === 403) {
    return new Error(
      "The secure media upload was rejected. Retry once, then sign in again if it continues.",
      { cause: error },
    );
  }
  if (error instanceof Error) return error;
  return new Error("Bakbak could not upload that media file.", {
    cause: error,
  });
}

function hasTusResponseStatus(
  value: unknown,
): value is { getStatus: () => number } {
  return isRecord(value) && typeof value.getStatus === "function";
}

async function invokeMediaFunction<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const response = (await getSupabaseClient().functions.invoke(
    "message-media-manage",
    { body },
  )) as unknown as { data: unknown; error: Error | null };
  if (response.error) throw response.error;
  if (isRecord(response.data) && typeof response.data.error === "string") {
    throw new Error(humanizeMediaError(response.data.error));
  }
  return response.data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanizeMediaError(code: string): string {
  const messages: Record<string, string> = {
    member_media_limit:
      "Your stored Bakbak media has reached the 1 GiB account limit.",
    target_access_required: "That conversation is no longer available.",
    media_too_large: "That file exceeds Bakbak's media limit.",
    attachments_unavailable: "One of those uploads expired. Try sending again.",
    message_delete_forbidden: "Only the author can delete that message.",
  };
  return messages[code] ?? "Bakbak could not finish that media request.";
}
