import type {
  ConversationMessage,
  DirectConversation,
  Sticker,
  WorkspaceSnapshot,
} from "./types";

const DATABASE_NAME = "bakbak-cache";
const DATABASE_VERSION = 2;
const ACCOUNT_STORE = "account_state";
const THREAD_STORE = "threads";
const PROFILE_MEDIA_STORE = "profile_media";
const MESSAGE_MEDIA_STORE = "message_media";

export const MAX_CACHED_MESSAGES_PER_THREAD = 200;
export const MAX_PROFILE_MEDIA_BYTES_PER_ACCOUNT = 256 * 1024 * 1024;
export const MAX_MESSAGE_MEDIA_BYTES_PER_ACCOUNT = 256 * 1024 * 1024;

export type DataFreshness = "loading" | "cached" | "fresh" | "offline";
export type CachedThreadKind = "channel" | "direct";
export type CachedDestination =
  { kind: "channel"; id: string } | { kind: "direct"; id: string };

export interface CachedAccountState {
  key: string;
  schemaVersion: 1;
  userId: string;
  workspace: WorkspaceSnapshot | null;
  directConversations: DirectConversation[];
  stickers?: Sticker[];
  lastDestination: CachedDestination | null;
  cachedAt: string;
}

export interface CachedThread {
  key: string;
  userId: string;
  kind: CachedThreadKind;
  threadId: string;
  messages: ConversationMessage[];
  cachedAt: string;
}

export interface CachedProfileMedia {
  key: string;
  userId: string;
  bucket: "avatars" | "profile-covers";
  path: string;
  blob: Blob;
  size: number;
  lastAccessedAt: number;
}

export interface CachedMessageMedia {
  key: string;
  userId: string;
  bucket: "message-media" | "message-stickers";
  path: string;
  blob: Blob;
  size: number;
  lastAccessedAt: number;
}

export interface CacheStats {
  messageBytes: number;
  messageCount: number;
  profileMediaBytes: number;
  profileMediaCount: number;
  messageMediaBytes: number;
  messageMediaCount: number;
  totalBytes: number;
}

export interface ProfileMediaReference {
  bucket: CachedProfileMedia["bucket"];
  path: string | null;
}

const emptyStats = (): CacheStats => ({
  messageBytes: 0,
  messageCount: 0,
  profileMediaBytes: 0,
  profileMediaCount: 0,
  messageMediaBytes: 0,
  messageMediaCount: 0,
  totalBytes: 0,
});

function accountKey(userId: string): string {
  return userId;
}

function threadKey(
  userId: string,
  kind: CachedThreadKind,
  threadId: string,
): string {
  return `${userId}:${kind}:${threadId}`;
}

function mediaKey(
  userId: string,
  bucket: CachedProfileMedia["bucket"],
  path: string,
): string {
  return `${userId}:${bucket}:${path}`;
}

function messageMediaKey(
  userId: string,
  bucket: CachedMessageMedia["bucket"],
  path: string,
): string {
  return `${userId}:${bucket}:${path}`;
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function safeAvatarUrl(url: string | null): string | null {
  return url?.startsWith("blob:") ? null : url;
}

export function normalizeWorkspaceForCache(
  workspace: WorkspaceSnapshot,
): WorkspaceSnapshot {
  return {
    ...workspace,
    members: workspace.members.map((member) => ({
      ...member,
      avatarUrl: safeAvatarUrl(member.avatarUrl),
      avatarAnimationUrl: null,
      coverUrl: null,
      coverAnimationUrl: null,
      status: "offline",
    })),
  };
}

export function normalizeDirectConversationsForCache(
  conversations: DirectConversation[],
): DirectConversation[] {
  return conversations.map((conversation) => ({
    ...conversation,
    otherMember: {
      ...conversation.otherMember,
      avatarUrl: safeAvatarUrl(conversation.otherMember.avatarUrl),
      avatarAnimationUrl: null,
      coverUrl: null,
      coverAnimationUrl: null,
      status: "offline",
    },
  }));
}

export function normalizeStickersForCache(stickers: Sticker[]): Sticker[] {
  return stickers.map((sticker) => ({
    ...sticker,
    posterUrl: null,
    animationUrl: null,
  }));
}

export function normalizeMessagesForCache<T extends ConversationMessage>(
  messages: readonly T[],
): T[] {
  return messages
    .filter((message) => !message.pending)
    .sort(compareMessages)
    .slice(-MAX_CACHED_MESSAGES_PER_THREAD)
    .map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => {
        const cached = { ...attachment };
        delete cached.objectUrl;
        delete cached.posterUrl;
        return cached;
      }),
    }));
}

export function compareMessages(
  left: ConversationMessage,
  right: ConversationMessage,
): number {
  return (
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

export function mergeMessages<T extends ConversationMessage>(
  ...groups: readonly (readonly T[])[]
): T[] {
  const byId = new Map<string, T>();
  groups.flat().forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort(compareMessages);
}

export class BakbakCache {
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
    private readonly profileMediaByteLimit = MAX_PROFILE_MEDIA_BYTES_PER_ACCOUNT,
    private readonly messageMediaByteLimit = MAX_MESSAGE_MEDIA_BYTES_PER_ACCOUNT,
  ) {}

  async readAccountState(userId: string): Promise<CachedAccountState | null> {
    return await this.withDatabase(async (database) => {
      const request = database
        .transaction(ACCOUNT_STORE)
        .objectStore(ACCOUNT_STORE)
        .get(accountKey(userId));
      return (
        ((await requestResult(request)) as CachedAccountState | undefined) ??
        null
      );
    }, null);
  }

  async writeAccountState(
    input: Omit<CachedAccountState, "key" | "schemaVersion" | "cachedAt">,
  ): Promise<void> {
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(ACCOUNT_STORE, "readwrite");
      transaction.objectStore(ACCOUNT_STORE).put({
        ...input,
        key: accountKey(input.userId),
        schemaVersion: 1,
        workspace: input.workspace
          ? normalizeWorkspaceForCache(input.workspace)
          : null,
        directConversations: normalizeDirectConversationsForCache(
          input.directConversations,
        ),
        stickers: normalizeStickersForCache(input.stickers ?? []),
        cachedAt: new Date().toISOString(),
      } satisfies CachedAccountState);
      await waitForTransaction(transaction);
    }, undefined);
  }

  async deleteAccountState(userId: string): Promise<void> {
    await this.deleteKeys(ACCOUNT_STORE, [accountKey(userId)]);
  }

  async readThread<T extends ConversationMessage>(
    userId: string,
    kind: CachedThreadKind,
    threadId: string,
  ): Promise<T[]> {
    return await this.withDatabase(async (database) => {
      const request = database
        .transaction(THREAD_STORE)
        .objectStore(THREAD_STORE)
        .get(threadKey(userId, kind, threadId));
      const value = (await requestResult(request)) as CachedThread | undefined;
      return (value?.messages ?? []) as T[];
    }, []);
  }

  async writeThread<T extends ConversationMessage>(
    userId: string,
    kind: CachedThreadKind,
    threadId: string,
    messages: readonly T[],
  ): Promise<void> {
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(THREAD_STORE, "readwrite");
      transaction.objectStore(THREAD_STORE).put({
        key: threadKey(userId, kind, threadId),
        userId,
        kind,
        threadId,
        messages: normalizeMessagesForCache(messages),
        cachedAt: new Date().toISOString(),
      } satisfies CachedThread);
      await waitForTransaction(transaction);
    }, undefined);
  }

  async deleteThread(
    userId: string,
    kind: CachedThreadKind,
    threadId: string,
  ): Promise<void> {
    await this.deleteKeys(THREAD_STORE, [threadKey(userId, kind, threadId)]);
  }

  async readProfileMedia(
    userId: string,
    bucket: CachedProfileMedia["bucket"],
    path: string,
  ): Promise<Blob | null> {
    const value = await this.withDatabase(async (database) => {
      const request = database
        .transaction(PROFILE_MEDIA_STORE)
        .objectStore(PROFILE_MEDIA_STORE)
        .get(mediaKey(userId, bucket, path));
      return (
        ((await requestResult(request)) as CachedProfileMedia | undefined) ??
        null
      );
    }, null);
    if (!value) return null;
    void this.touchProfileMedia(value);
    return value.blob;
  }

  async writeProfileMedia(
    userId: string,
    bucket: CachedProfileMedia["bucket"],
    path: string,
    blob: Blob,
  ): Promise<void> {
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(
        PROFILE_MEDIA_STORE,
        "readwrite",
      );
      transaction.objectStore(PROFILE_MEDIA_STORE).put({
        key: mediaKey(userId, bucket, path),
        userId,
        bucket,
        path,
        blob,
        size: blob.size,
        lastAccessedAt: Date.now(),
      } satisfies CachedProfileMedia);
      await waitForTransaction(transaction);
    }, undefined);
    await this.pruneProfileMedia(userId);
  }

  async evictProfileMedia(
    userId: string,
    bucket: CachedProfileMedia["bucket"],
    path: string | null,
  ): Promise<void> {
    if (!path) return;
    await this.deleteKeys(PROFILE_MEDIA_STORE, [
      mediaKey(userId, bucket, path),
    ]);
  }

  async readMessageMedia(
    userId: string,
    bucket: CachedMessageMedia["bucket"],
    path: string,
  ): Promise<Blob | null> {
    const value = await this.withDatabase(async (database) => {
      const request = database
        .transaction(MESSAGE_MEDIA_STORE)
        .objectStore(MESSAGE_MEDIA_STORE)
        .get(messageMediaKey(userId, bucket, path));
      return (
        ((await requestResult(request)) as CachedMessageMedia | undefined) ??
        null
      );
    }, null);
    if (!value) return null;
    void this.touchMessageMedia(value);
    return value.blob;
  }

  async writeMessageMedia(
    userId: string,
    bucket: CachedMessageMedia["bucket"],
    path: string,
    blob: Blob,
  ): Promise<void> {
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(
        MESSAGE_MEDIA_STORE,
        "readwrite",
      );
      transaction.objectStore(MESSAGE_MEDIA_STORE).put({
        key: messageMediaKey(userId, bucket, path),
        userId,
        bucket,
        path,
        blob,
        size: blob.size,
        lastAccessedAt: Date.now(),
      } satisfies CachedMessageMedia);
      await waitForTransaction(transaction);
    }, undefined);
    await this.pruneMessageMedia(userId);
  }

  async retainProfileMedia(
    userId: string,
    references: readonly ProfileMediaReference[],
  ): Promise<void> {
    const allowed = new Set<string>();
    references.forEach((reference) => {
      if (reference.path) {
        allowed.add(mediaKey(userId, reference.bucket, reference.path));
      }
    });
    await this.withDatabase(async (database) => {
      const all = (await requestResult(
        database
          .transaction(PROFILE_MEDIA_STORE)
          .objectStore(PROFILE_MEDIA_STORE)
          .getAll(),
      )) as CachedProfileMedia[];
      await this.deleteKeys(
        PROFILE_MEDIA_STORE,
        all
          .filter((item) => item.userId === userId && !allowed.has(item.key))
          .map((item) => item.key),
      );
    }, undefined);
  }

  async stats(userId: string): Promise<CacheStats> {
    return await this.withDatabase(async (database) => {
      const [threads, media, messageMedia] = await Promise.all([
        requestResult(
          database.transaction(THREAD_STORE).objectStore(THREAD_STORE).getAll(),
        ) as Promise<CachedThread[]>,
        requestResult(
          database
            .transaction(PROFILE_MEDIA_STORE)
            .objectStore(PROFILE_MEDIA_STORE)
            .getAll(),
        ) as Promise<CachedProfileMedia[]>,
        requestResult(
          database
            .transaction(MESSAGE_MEDIA_STORE)
            .objectStore(MESSAGE_MEDIA_STORE)
            .getAll(),
        ) as Promise<CachedMessageMedia[]>,
      ]);
      const scopedThreads = threads.filter((item) => item.userId === userId);
      const scopedMedia = media.filter((item) => item.userId === userId);
      const scopedMessageMedia = messageMedia.filter(
        (item) => item.userId === userId,
      );
      const messageBytes = scopedThreads.reduce(
        (total, thread) =>
          total +
          new TextEncoder().encode(JSON.stringify(thread.messages)).length,
        0,
      );
      const profileMediaBytes = scopedMedia.reduce(
        (total, item) => total + item.size,
        0,
      );
      const messageMediaBytes = scopedMessageMedia.reduce(
        (total, item) => total + item.size,
        0,
      );
      return {
        messageBytes,
        messageCount: scopedThreads.reduce(
          (total, thread) => total + thread.messages.length,
          0,
        ),
        profileMediaBytes,
        profileMediaCount: scopedMedia.length,
        messageMediaBytes,
        messageMediaCount: scopedMessageMedia.length,
        totalBytes: messageBytes + profileMediaBytes + messageMediaBytes,
      };
    }, emptyStats());
  }

  async clearAccount(userId: string): Promise<void> {
    await this.withDatabase(async (database) => {
      const [accountStates, threads, media, messageMedia] = await Promise.all([
        requestResult(
          database
            .transaction(ACCOUNT_STORE)
            .objectStore(ACCOUNT_STORE)
            .getAll(),
        ) as Promise<CachedAccountState[]>,
        requestResult(
          database.transaction(THREAD_STORE).objectStore(THREAD_STORE).getAll(),
        ) as Promise<CachedThread[]>,
        requestResult(
          database
            .transaction(PROFILE_MEDIA_STORE)
            .objectStore(PROFILE_MEDIA_STORE)
            .getAll(),
        ) as Promise<CachedProfileMedia[]>,
        requestResult(
          database
            .transaction(MESSAGE_MEDIA_STORE)
            .objectStore(MESSAGE_MEDIA_STORE)
            .getAll(),
        ) as Promise<CachedMessageMedia[]>,
      ]);
      const transaction = database.transaction(
        [ACCOUNT_STORE, THREAD_STORE, PROFILE_MEDIA_STORE, MESSAGE_MEDIA_STORE],
        "readwrite",
      );
      const accountStore = transaction.objectStore(ACCOUNT_STORE);
      const threadStore = transaction.objectStore(THREAD_STORE);
      const mediaStore = transaction.objectStore(PROFILE_MEDIA_STORE);
      const messageMediaStore = transaction.objectStore(MESSAGE_MEDIA_STORE);
      accountStates
        .filter((item) => item.userId === userId)
        .forEach((item) => accountStore.delete(item.key));
      threads
        .filter((item) => item.userId === userId)
        .forEach((item) => threadStore.delete(item.key));
      media
        .filter((item) => item.userId === userId)
        .forEach((item) => mediaStore.delete(item.key));
      messageMedia
        .filter((item) => item.userId === userId)
        .forEach((item) => messageMediaStore.delete(item.key));
      await waitForTransaction(transaction);
    }, undefined);
  }

  close(): void {
    void this.databasePromise?.then((database) => database?.close());
    this.databasePromise = null;
  }

  private async pruneProfileMedia(userId: string): Promise<void> {
    await this.withDatabase(async (database) => {
      const all = (await requestResult(
        database
          .transaction(PROFILE_MEDIA_STORE)
          .objectStore(PROFILE_MEDIA_STORE)
          .getAll(),
      )) as CachedProfileMedia[];
      const scoped = all
        .filter((item) => item.userId === userId)
        .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
      let total = scoped.reduce((sum, item) => sum + item.size, 0);
      const expired: string[] = [];
      for (const item of scoped) {
        if (total <= this.profileMediaByteLimit) break;
        expired.push(item.key);
        total -= item.size;
      }
      await this.deleteKeys(PROFILE_MEDIA_STORE, expired);
    }, undefined);
  }

  private async pruneMessageMedia(userId: string): Promise<void> {
    await this.withDatabase(async (database) => {
      const all = (await requestResult(
        database
          .transaction(MESSAGE_MEDIA_STORE)
          .objectStore(MESSAGE_MEDIA_STORE)
          .getAll(),
      )) as CachedMessageMedia[];
      const scoped = all
        .filter((item) => item.userId === userId)
        .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
      let total = scoped.reduce((sum, item) => sum + item.size, 0);
      const expired: string[] = [];
      for (const item of scoped) {
        if (total <= this.messageMediaByteLimit) break;
        expired.push(item.key);
        total -= item.size;
      }
      await this.deleteKeys(MESSAGE_MEDIA_STORE, expired);
    }, undefined);
  }

  private async touchProfileMedia(value: CachedProfileMedia): Promise<void> {
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(
        PROFILE_MEDIA_STORE,
        "readwrite",
      );
      transaction.objectStore(PROFILE_MEDIA_STORE).put({
        ...value,
        lastAccessedAt: Date.now(),
      } satisfies CachedProfileMedia);
      await waitForTransaction(transaction);
    }, undefined);
  }

  private async touchMessageMedia(value: CachedMessageMedia): Promise<void> {
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(
        MESSAGE_MEDIA_STORE,
        "readwrite",
      );
      transaction.objectStore(MESSAGE_MEDIA_STORE).put({
        ...value,
        lastAccessedAt: Date.now(),
      } satisfies CachedMessageMedia);
      await waitForTransaction(transaction);
    }, undefined);
  }

  private async deleteKeys(
    storeName: string,
    keys: readonly string[],
  ): Promise<void> {
    if (keys.length === 0) return;
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      keys.forEach((key) => store.delete(key));
      await waitForTransaction(transaction);
    }, undefined);
  }

  private async withDatabase<T>(
    operation: (database: IDBDatabase) => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      const database = await this.open();
      if (!database) return fallback;
      return await operation(database);
    } catch {
      return fallback;
    }
  }

  private async open(): Promise<IDBDatabase | null> {
    if (!this.factory) return null;
    this.databasePromise ??= new Promise((resolve) => {
      const request = this.factory?.open(DATABASE_NAME, DATABASE_VERSION);
      if (!request) return resolve(null);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ACCOUNT_STORE)) {
          database.createObjectStore(ACCOUNT_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(THREAD_STORE)) {
          database.createObjectStore(THREAD_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(PROFILE_MEDIA_STORE)) {
          database.createObjectStore(PROFILE_MEDIA_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(MESSAGE_MEDIA_STORE)) {
          database.createObjectStore(MESSAGE_MEDIA_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return await this.databasePromise;
  }
}
