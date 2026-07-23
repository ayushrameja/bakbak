import { Upload } from "tus-js-client";
import { appConfig } from "./env";
import { BakbakCache } from "./local-cache";
import { getSupabaseClient } from "./supabase";
import type { MessageScope, StagedMessageAttachment } from "./types";

const mediaCache = new BakbakCache();

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

export async function downloadMessageMedia(
  path: string,
  cachePoster = false,
): Promise<Blob> {
  const userId = cachePoster ? await currentUserId() : null;
  if (userId) {
    const cached = await mediaCache.readMessageMedia(
      userId,
      "message-media",
      path,
    );
    if (cached) return cached;
  }
  const { data, error } = await getSupabaseClient()
    .storage.from("message-media")
    .download(path);
  if (error) throw error;
  if (userId) {
    await mediaCache.writeMessageMedia(userId, "message-media", path, data);
  }
  return data;
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();
  return session?.user.id ?? null;
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
