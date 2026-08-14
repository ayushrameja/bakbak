import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

export const SCREEN_SHARE_PROTOCOL_VERSION = 1 as const;
export const SCREEN_SHARE_HELPER_BINARY = "bakbak-screen-share-helper";
export const SCREEN_SHARE_MAX_LINE_BYTES = 32 * 1024 * 1024;
export const SCREEN_SHARE_MAX_SOURCES = 256;
export const SCREEN_SHARE_MAX_TOKEN_BYTES = 16 * 1024;

export type ScreenShareHelperCommand =
  | "hello"
  | "capabilities"
  | "listSources"
  | "start"
  | "update"
  | "stop"
  | "shutdown";

export interface NativeScreenShareCapabilities {
  video: boolean;
  systemAudio: boolean;
  applicationAudio: boolean;
  processTreeIsolation: boolean;
  minOsVersion: string | null;
  reason: string | null;
}

export interface NativeScreenShareSource {
  id: string;
  kind: "display" | "application";
  label: string;
  applicationLabel: string | null;
  audioAvailable: boolean;
  audioUnavailableReason: string | null;
  thumbnailDataUrl: string | null;
}

export interface NativeScreenShareSettings {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}

export interface NativeScreenShareSession {
  sessionId: string;
  sourceLabel: string;
  sourceKind: "display" | "application";
  audioPublished: boolean;
  audioUnavailableReason: string | null;
  settings: NativeScreenShareSettings;
  diagnostics: {
    captureBackend: string;
    audioIsolationMode:
      | "disabled"
      | "exclude-bakbak-process-tree"
      | "include-selected-process-tree";
  };
}

export interface NativeScreenShareLifecycleEvent {
  sessionId?: string;
  state:
    | "ready"
    | "starting"
    | "live"
    | "audio-downgraded"
    | "stopping"
    | "stopped"
    | "failed"
    | "shutting-down";
  reasonCode?: string;
  message?: string;
  audioPublished?: boolean;
}

export interface ScreenShareHelperConfig {
  binaryPath: string;
  electronRootPid: number;
  bundleId: string;
  appVersion: string;
  nativeAudioEnabled: boolean;
  spawnHelper?: (binaryPath: string) => ChildProcessWithoutNullStreams;
}

interface PendingRequest {
  command: ScreenShareHelperCommand;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS: Record<ScreenShareHelperCommand, number> = {
  hello: 5_000,
  capabilities: 15_000,
  listSources: 15_000,
  start: 30_000,
  update: 15_000,
  stop: 15_000,
  shutdown: 15_000,
};

export class ScreenShareHelperError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ScreenShareHelperError";
  }
}

export class ScreenShareHelperManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private stdoutBuffer = Buffer.alloc(0);
  private nextRequestId = 1;
  private pending = new Map<string, PendingRequest>();
  private lifecycleListeners = new Set<
    (event: NativeScreenShareLifecycleEvent) => void
  >();
  private activeSessionId: string | null = null;
  private shuttingDown = false;

  constructor(private readonly config: ScreenShareHelperConfig) {}

  onLifecycle(
    listener: (event: NativeScreenShareLifecycleEvent) => void,
  ): () => void {
    this.lifecycleListeners.add(listener);
    return () => this.lifecycleListeners.delete(listener);
  }

  async capabilities(): Promise<NativeScreenShareCapabilities> {
    const capabilities = await this.request<NativeScreenShareCapabilities>(
      "capabilities",
      {},
    );
    return this.config.nativeAudioEnabled
      ? capabilities
      : {
          ...capabilities,
          systemAudio: false,
          applicationAudio: false,
          processTreeIsolation: false,
          reason:
            "Native screen audio is limited to stabilization candidates until installed isolation testing passes.",
        };
  }

  async listSources(input: {
    includeThumbnails?: boolean;
  }): Promise<{ sources: NativeScreenShareSource[]; truncated: boolean }> {
    validateListSourcesInput(input);
    const result = await this.request<{
      sources: NativeScreenShareSource[];
      truncated: boolean;
    }>("listSources", input);
    if (this.config.nativeAudioEnabled) return result;
    return {
      ...result,
      sources: result.sources.map((source) => ({
        ...source,
        audioAvailable: false,
        audioUnavailableReason:
          "Native screen audio is limited to stabilization candidates until installed isolation testing passes.",
      })),
    };
  }

  async start(input: {
    serverUrl: string;
    token: string;
    sourceId: string;
    includeAudio: boolean;
    settings: NativeScreenShareSettings;
  }): Promise<NativeScreenShareSession> {
    validateStartInput(input);
    if (input.includeAudio && !this.config.nativeAudioEnabled) {
      throw new ScreenShareHelperError(
        "native-audio-rollout-disabled",
        "Native screen audio is not enabled in this build.",
      );
    }
    const session = await this.request<NativeScreenShareSession>(
      "start",
      input,
    );
    if (session.audioPublished && !input.includeAudio) {
      const error = new ScreenShareHelperError(
        "helper-protocol-failed",
        "Native screen sharing returned an invalid response.",
      );
      this.protocolFault(error);
      throw error;
    }
    this.activeSessionId = session.sessionId;
    return session;
  }

  async update(input: {
    sessionId: string;
    settings?: NativeScreenShareSettings;
    paused?: boolean;
  }): Promise<{
    sessionId: string;
    settings: NativeScreenShareSettings;
    paused: boolean;
  }> {
    validateUpdateInput(input);
    return this.request("update", input);
  }

  async stop(input: {
    sessionId: string;
  }): Promise<{ sessionId: string; stopped: true }> {
    validateSessionId(input.sessionId);
    const result = await this.request<{ sessionId: string; stopped: true }>(
      "stop",
      input,
    );
    if (this.activeSessionId === result.sessionId) this.activeSessionId = null;
    return result;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const child = this.child;
    if (!child) return;
    try {
      await this.sendRequest("shutdown", {});
    } catch {
      // App shutdown must not be held hostage by a crashed helper.
    } finally {
      if (this.child === child) child.kill();
      this.resetChild(
        child,
        new Error("Screen-share helper shut down."),
        false,
      );
    }
  }

  async stopActive(): Promise<void> {
    const child = this.child;
    if (!child) return;
    const startInFlight = [...this.pending.values()].some(
      (pending) => pending.command === "start",
    );
    try {
      if (this.activeSessionId && !startInFlight) {
        await withTeardownTimeout(
          this.sendRequest("stop", { sessionId: this.activeSessionId }),
          1_000,
        );
      }
    } catch {
      // Killing the owned child below is the fail-safe teardown.
    } finally {
      if (this.child === child) child.kill();
      this.resetChild(
        child,
        new ScreenShareHelperError(
          "window-closed",
          "Native screen sharing stopped because the window closed.",
        ),
        false,
      );
    }
  }

  private async request<T>(
    command: Exclude<ScreenShareHelperCommand, "hello" | "shutdown">,
    payload: unknown,
  ): Promise<T> {
    if (this.shuttingDown) {
      throw new ScreenShareHelperError(
        "helper-shutting-down",
        "Native screen sharing is shutting down.",
      );
    }
    await this.ensureStarted();
    return this.sendRequest(command, payload) as Promise<T>;
  }

  private async ensureStarted(): Promise<void> {
    if (this.child) return this.starting ?? Promise.resolve();
    if (this.starting) return this.starting;
    const child = (this.config.spawnHelper ?? defaultSpawn)(
      this.config.binaryPath,
    );
    this.child = child;
    this.stdoutBuffer = Buffer.alloc(0);
    child.stdout.on("data", (chunk: Buffer | string) =>
      this.consumeStdout(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    // Consume stderr so the helper cannot block. Raw native output is never logged.
    child.stderr.on("data", () => undefined);
    child.once("error", () =>
      this.resetChild(
        child,
        new ScreenShareHelperError(
          "helper-launch-failed",
          "Native screen sharing could not start.",
        ),
        true,
      ),
    );
    child.once("exit", () =>
      this.resetChild(
        child,
        new ScreenShareHelperError(
          "helper-exited",
          "Native screen sharing ended unexpectedly.",
        ),
        true,
      ),
    );
    const starting = this.sendRequest("hello", {
      electronRootPid: this.config.electronRootPid,
      bundleId: this.config.bundleId,
      appVersion: this.config.appVersion,
    }).then((result) => {
      validateHelloResult(result);
    });
    this.starting = starting;
    try {
      await starting;
    } catch (error) {
      this.protocolFault(
        error instanceof Error ? error : new Error("Helper handshake failed."),
      );
      throw error;
    } finally {
      if (this.starting === starting) this.starting = null;
    }
  }

  private sendRequest(
    command: ScreenShareHelperCommand,
    payload: unknown,
  ): Promise<unknown> {
    const child = this.child;
    if (!child || child.stdin.destroyed || !child.stdin.writable) {
      return Promise.reject(
        new ScreenShareHelperError(
          "helper-unavailable",
          "Native screen sharing is unavailable.",
        ),
      );
    }
    const requestId = String(this.nextRequestId++);
    const serialized = `${JSON.stringify({
      protocolVersion: SCREEN_SHARE_PROTOCOL_VERSION,
      requestId,
      command,
      payload,
    })}\n`;
    if (Buffer.byteLength(serialized) > SCREEN_SHARE_MAX_LINE_BYTES) {
      return Promise.reject(
        new ScreenShareHelperError(
          "request-too-large",
          "The native screen-share request is too large.",
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        const error = new ScreenShareHelperError(
          "helper-timeout",
          `Native screen sharing timed out during ${command}.`,
        );
        reject(error);
        this.protocolFault(error);
      }, REQUEST_TIMEOUT_MS[command]);
      this.pending.set(requestId, { command, resolve, reject, timer });
      child.stdin.write(serialized, "utf8", (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(
          new ScreenShareHelperError(
            "helper-write-failed",
            "Native screen sharing could not receive the request.",
          ),
        );
      });
    });
  }

  private consumeStdout(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    if (this.stdoutBuffer.length > SCREEN_SHARE_MAX_LINE_BYTES) {
      const newline = this.stdoutBuffer.indexOf(0x0a);
      if (newline < 0 || newline > SCREEN_SHARE_MAX_LINE_BYTES) {
        this.protocolFault(
          new ScreenShareHelperError(
            "protocol-line-too-large",
            "Native screen sharing returned an oversized response.",
          ),
        );
        return;
      }
    }
    let newline = this.stdoutBuffer.indexOf(0x0a);
    while (newline >= 0) {
      const line = this.stdoutBuffer.subarray(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.subarray(newline + 1);
      if (line.length > SCREEN_SHARE_MAX_LINE_BYTES) {
        this.protocolFault(new Error("Oversized helper response."));
        return;
      }
      if (line.length > 0) this.consumeLine(line.toString("utf8"));
      if (!this.child) return;
      newline = this.stdoutBuffer.indexOf(0x0a);
    }
    if (this.stdoutBuffer.length > SCREEN_SHARE_MAX_LINE_BYTES) {
      this.protocolFault(
        new ScreenShareHelperError(
          "protocol-line-too-large",
          "Native screen sharing returned an oversized response.",
        ),
      );
    }
  }

  private consumeLine(line: string): void {
    let envelope: unknown;
    try {
      envelope = JSON.parse(line) as unknown;
    } catch {
      this.protocolFault(
        new ScreenShareHelperError(
          "protocol-invalid-json",
          "Native screen sharing returned an invalid response.",
        ),
      );
      return;
    }
    if (!isRecord(envelope) || envelope.protocolVersion !== 1) {
      this.protocolFault(new Error("Invalid helper protocol version."));
      return;
    }
    if (envelope.event === "lifecycle") {
      if (!isLifecycleEvent(envelope.payload)) {
        this.protocolFault(new Error("Invalid helper lifecycle event."));
        return;
      }
      if (
        (envelope.payload.state === "live" ||
          envelope.payload.state === "audio-downgraded") &&
        envelope.payload.sessionId
      ) {
        this.activeSessionId = envelope.payload.sessionId;
      } else if (
        envelope.payload.state === "stopped" ||
        envelope.payload.state === "failed"
      ) {
        this.activeSessionId = null;
      }
      for (const listener of this.lifecycleListeners)
        listener(envelope.payload);
      return;
    }
    if (typeof envelope.requestId !== "string") {
      this.protocolFault(new Error("Missing helper request correlation."));
      return;
    }
    const pending = this.pending.get(envelope.requestId);
    if (!pending) {
      this.protocolFault(new Error("Unknown helper request correlation."));
      return;
    }
    if (typeof envelope.ok !== "boolean") {
      this.protocolFault(new Error("Invalid helper response envelope."));
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(envelope.requestId);
    if (!envelope.ok) {
      if (!isHelperError(envelope.error)) {
        pending.reject(
          new ScreenShareHelperError(
            "helper-protocol-failed",
            "Native screen sharing returned an invalid response.",
          ),
        );
        this.protocolFault(new Error("Invalid helper error envelope."));
        return;
      }
      const code = helperErrorCode(envelope.error);
      pending.reject(
        new ScreenShareHelperError(
          code,
          `Native screen sharing failed (${code}).`,
        ),
      );
      return;
    }
    try {
      validateCommandResult(pending.command, envelope.result);
      pending.resolve(envelope.result);
    } catch {
      pending.reject(
        new ScreenShareHelperError(
          "helper-protocol-failed",
          "Native screen sharing returned an invalid response.",
        ),
      );
      this.protocolFault(new Error("Invalid helper command result."));
    }
  }

  private protocolFault(error: Error): void {
    const child = this.child;
    if (child) child.kill();
    this.resetChild(
      child,
      new ScreenShareHelperError(
        "helper-protocol-failed",
        "Native screen sharing returned an invalid response.",
      ),
      true,
    );
    void error;
  }

  private resetChild(
    child: ChildProcessWithoutNullStreams | null,
    error: Error,
    emitFailure: boolean,
  ): void {
    if (!child || this.child !== child) return;
    this.child = null;
    this.starting = null;
    this.stdoutBuffer = Buffer.alloc(0);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    const sessionId = this.activeSessionId;
    this.activeSessionId = null;
    if (emitFailure && sessionId && !this.shuttingDown) {
      const lifecycle: NativeScreenShareLifecycleEvent = {
        sessionId,
        state: "failed",
        reasonCode: "helper-exited",
        message: "Native screen sharing ended unexpectedly.",
        audioPublished: false,
      };
      for (const listener of this.lifecycleListeners) listener(lifecycle);
    }
  }
}

export function resolveScreenShareHelperPath(input: {
  packaged: boolean;
  resourcesPath: string;
  appPath: string;
  platform: NodeJS.Platform;
  developmentOverride?: string;
}): string {
  const binary = `${SCREEN_SHARE_HELPER_BINARY}${
    input.platform === "win32" ? ".exe" : ""
  }`;
  if (input.packaged) return path.join(input.resourcesPath, "native", binary);
  if (input.developmentOverride) {
    return path.resolve(input.developmentOverride);
  }
  const profile =
    process.env.BAKBAK_SCREEN_SHARE_HELPER_PROFILE === "release"
      ? "release"
      : "debug";
  return path.join(
    input.appPath,
    "native",
    "screen-share-helper",
    "target",
    profile,
    binary,
  );
}

function defaultSpawn(binaryPath: string): ChildProcessWithoutNullStreams {
  return spawn(binaryPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: helperEnvironment(process.env),
  });
}

async function withTeardownTimeout(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Native teardown timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function helperEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
  ] as const;
  const environment: NodeJS.ProcessEnv = {};
  for (const name of allowed) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function validateCommandResult(
  command: ScreenShareHelperCommand,
  value: unknown,
): void {
  if (command === "hello") return validateHelloResult(value);
  if (command === "capabilities") return validateCapabilities(value);
  if (command === "listSources") return validateSourceResult(value);
  if (command === "start") return validateSession(value);
  if (command === "update") return validateUpdateResult(value);
  if (command === "stop") return validateStopResult(value);
  if (command === "shutdown") {
    if (!isRecord(value) || value.accepted !== true) throw new Error();
  }
}

function validateHelloResult(value: unknown): void {
  if (
    !isRecord(value) ||
    value.protocolVersion !== 1 ||
    typeof value.helperVersion !== "string" ||
    !["macos", "windows", "unsupported"].includes(String(value.platform))
  ) {
    throw new Error("Helper handshake did not match protocol v1.");
  }
  validateCapabilities(value.capabilities);
}

function validateCapabilities(
  value: unknown,
): asserts value is NativeScreenShareCapabilities {
  if (
    !isRecord(value) ||
    typeof value.video !== "boolean" ||
    typeof value.systemAudio !== "boolean" ||
    typeof value.applicationAudio !== "boolean" ||
    typeof value.processTreeIsolation !== "boolean" ||
    !isNullableString(value.minOsVersion, 128) ||
    !isNullableString(value.reason, 512)
  )
    throw new Error();
}

function validateSourceResult(value: unknown): void {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sources) ||
    value.sources.length > SCREEN_SHARE_MAX_SOURCES ||
    typeof value.truncated !== "boolean" ||
    !value.sources.every(isSource)
  )
    throw new Error();
}

function isSource(value: unknown): value is NativeScreenShareSource {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 1, 512) &&
    (value.kind === "display" || value.kind === "application") &&
    isBoundedString(value.label, 1, 512) &&
    isNullableString(value.applicationLabel, 512) &&
    typeof value.audioAvailable === "boolean" &&
    isNullableString(value.audioUnavailableReason, 512) &&
    isNullableString(value.thumbnailDataUrl, 4 * 1024 * 1024)
  );
}

function validateSession(value: unknown): void {
  if (
    !isRecord(value) ||
    !isBoundedString(value.sessionId, 1, 256) ||
    !isBoundedString(value.sourceLabel, 1, 512) ||
    (value.sourceKind !== "display" && value.sourceKind !== "application") ||
    typeof value.audioPublished !== "boolean" ||
    !isNullableString(value.audioUnavailableReason, 512) ||
    !isRecord(value.diagnostics) ||
    !isBoundedString(value.diagnostics.captureBackend, 1, 128) ||
    ![
      "disabled",
      "exclude-bakbak-process-tree",
      "include-selected-process-tree",
    ].includes(String(value.diagnostics.audioIsolationMode))
  )
    throw new Error();
  validateSettings(value.settings);
  const isolationMode = value.diagnostics.audioIsolationMode;
  if (
    value.audioPublished
      ? value.audioUnavailableReason !== null ||
        (value.sourceKind === "display"
          ? isolationMode !== "exclude-bakbak-process-tree"
          : isolationMode !== "include-selected-process-tree")
      : isolationMode !== "disabled"
  ) {
    throw new Error();
  }
}

function validateUpdateResult(value: unknown): void {
  if (
    !isRecord(value) ||
    !isBoundedString(value.sessionId, 1, 256) ||
    typeof value.paused !== "boolean"
  )
    throw new Error();
  validateSettings(value.settings);
}

function validateStopResult(value: unknown): void {
  if (
    !isRecord(value) ||
    !isBoundedString(value.sessionId, 1, 256) ||
    value.stopped !== true
  ) {
    throw new Error();
  }
}

function validateListSourcesInput(value: unknown): void {
  if (
    !isRecord(value) ||
    (value.includeThumbnails !== undefined &&
      typeof value.includeThumbnails !== "boolean")
  )
    throw new Error("Invalid screen-share source request.");
}

function validateStartInput(value: unknown): void {
  if (
    !isRecord(value) ||
    !isBoundedString(value.serverUrl, 1, 2_048) ||
    !isSecureWebSocketUrl(value.serverUrl) ||
    !isBoundedString(value.token, 1, SCREEN_SHARE_MAX_TOKEN_BYTES) ||
    Buffer.byteLength(value.token) > SCREEN_SHARE_MAX_TOKEN_BYTES ||
    !isBoundedString(value.sourceId, 1, 512) ||
    typeof value.includeAudio !== "boolean"
  )
    throw new Error("Invalid native screen-share request.");
  validateSettings(value.settings);
}

function validateUpdateInput(value: unknown): void {
  if (!isRecord(value)) throw new Error("Invalid screen-share update.");
  validateSessionId(value.sessionId);
  if (value.settings !== undefined) validateSettings(value.settings);
  if (value.paused !== undefined && typeof value.paused !== "boolean") {
    throw new Error("Invalid screen-share pause state.");
  }
  if (value.settings === undefined && value.paused === undefined) {
    throw new Error("A screen-share update is required.");
  }
}

function validateSettings(
  value: unknown,
): asserts value is NativeScreenShareSettings {
  if (!isRecord(value) || !isSupportedSettingsTuple(value))
    throw new Error("Invalid native screen-share settings.");
}

function isSupportedSettingsTuple(value: Record<string, unknown>): boolean {
  if (
    !isIntegerInRange(value.frameRate, 15, 60) ||
    ![15, 30, 60].includes(Number(value.frameRate))
  )
    return false;
  const key = `${String(value.width)}x${String(value.height)}@${String(value.frameRate)}`;
  const bitrates: Record<string, number> = {
    "854x480@15": 800_000,
    "854x480@30": 1_500_000,
    "854x480@60": 2_500_000,
    "1280x720@15": 1_500_000,
    "1280x720@30": 2_000_000,
    "1280x720@60": 4_000_000,
    "1920x1080@15": 2_500_000,
    "1920x1080@30": 5_000_000,
    "1920x1080@60": 8_000_000,
  };
  return bitrates[key] === value.maxBitrate;
}

function validateSessionId(value: unknown): asserts value is string {
  if (!isBoundedString(value, 1, 256)) {
    throw new Error("Invalid screen-share session.");
  }
}

function isLifecycleEvent(
  value: unknown,
): value is NativeScreenShareLifecycleEvent {
  const states = [
    "ready",
    "starting",
    "live",
    "audio-downgraded",
    "stopping",
    "stopped",
    "failed",
    "shutting-down",
  ];
  return (
    isRecord(value) &&
    states.includes(String(value.state)) &&
    (value.sessionId === undefined ||
      isBoundedString(value.sessionId, 1, 256)) &&
    (value.reasonCode === undefined ||
      isBoundedString(value.reasonCode, 1, 128)) &&
    (value.message === undefined || isBoundedString(value.message, 1, 512)) &&
    (value.audioPublished === undefined ||
      typeof value.audioPublished === "boolean")
  );
}

function helperErrorCode(value: unknown): string {
  if (!isRecord(value) || !isBoundedString(value.code, 1, 128)) {
    return "helper-request-failed";
  }
  return /^[a-z0-9-]+$/.test(value.code) ? value.code : "helper-request-failed";
}

function isHelperError(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value.code, 1, 128) &&
    /^[a-z0-9-]+$/.test(value.code) &&
    isBoundedString(value.message, 1, 512) &&
    typeof value.retryable === "boolean"
  );
}

function isSecureWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "wss:" &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isNullableString(
  value: unknown,
  maximum: number,
): value is string | null {
  return (
    value === null || (typeof value === "string" && value.length <= maximum)
  );
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): boolean {
  return (
    Number.isInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}
