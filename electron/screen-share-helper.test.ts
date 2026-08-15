// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCREEN_SHARE_MAX_LINE_BYTES,
  ScreenShareHelperManager,
  helperEnvironment,
  resolveScreenShareHelperPath,
} from "./screen-share-helper.js";

const capabilities = {
  video: true,
  systemAudio: true,
  applicationAudio: true,
  processTreeIsolation: true,
  minOsVersion: null,
  reason: null,
};

interface FakeHelper {
  child: ChildProcessWithoutNullStreams;
  stdout: PassThrough;
  stderr: PassThrough;
  requests: Array<Record<string, unknown>>;
  respond(value: unknown): void;
  exit(): void;
  kill: ReturnType<typeof vi.fn>;
}

function createFakeHelper(
  onRequest?: (request: Record<string, unknown>, helper: FakeHelper) => void,
): FakeHelper {
  const emitter = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const kill = vi.fn(() => true);
  const requests: Array<Record<string, unknown>> = [];
  const child = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    kill,
    pid: 456,
  }) as unknown as ChildProcessWithoutNullStreams;
  const helper: FakeHelper = {
    child,
    stdout,
    stderr,
    requests,
    respond(value) {
      stdout.write(`${JSON.stringify(value)}\n`);
    },
    exit() {
      emitter.emit("exit", 1, null);
    },
    kill,
  };
  stdin.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").trim().split("\n")) {
      if (!line) continue;
      const request = JSON.parse(line) as Record<string, unknown>;
      requests.push(request);
      if (request.command === "hello") {
        // Rust serializes absent Option fields as null. The protocol accepts
        // that real hello lifecycle before the correlated hello response.
        helper.respond({
          protocolVersion: 1,
          event: "lifecycle",
          payload: {
            sessionId: null,
            state: "ready",
            reasonCode: null,
            message: null,
            audioPublished: null,
          },
        });
        helper.respond({
          protocolVersion: 1,
          requestId: request.requestId,
          ok: true,
          result: {
            protocolVersion: 1,
            helperVersion: "0.1.0",
            platform: "windows",
            capabilities,
          },
        });
      } else {
        onRequest?.(request, helper);
      }
    }
  });
  return helper;
}

function managerFor(
  helper: FakeHelper,
  nativeAudioEnabled = true,
): ScreenShareHelperManager {
  return new ScreenShareHelperManager({
    binaryPath: "/native/bakbak-screen-share-helper",
    electronRootPid: 123,
    bundleId: "com.bakbak.desktop",
    appVersion: "1.7.2",
    nativeAudioEnabled,
    spawnHelper: () => helper.child,
  });
}

describe("ScreenShareHelperManager", () => {
  beforeEach(() => vi.useRealTimers());

  it("requires the exact v1 hello before a correlated command", async () => {
    const helper = createFakeHelper((request, target) => {
      target.respond({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: true,
        result: capabilities,
      });
    });
    const manager = managerFor(helper);
    await expect(manager.capabilities()).resolves.toEqual(capabilities);
    expect(helper.requests.map((request) => request.command)).toEqual([
      "hello",
      "capabilities",
    ]);
    expect(helper.requests[0]).toMatchObject({
      protocolVersion: 1,
      payload: {
        electronRootPid: 123,
        bundleId: "com.bakbak.desktop",
        appVersion: "1.7.2",
      },
    });
  });

  it("fails closed and kills the helper on malformed JSON", async () => {
    const helper = createFakeHelper((request, target) => {
      if (request.command === "capabilities") target.stdout.write("not-json\n");
    });
    const manager = managerFor(helper);
    await expect(manager.capabilities()).rejects.toMatchObject({
      code: "helper-protocol-failed",
    });
    expect(helper.kill).toHaveBeenCalled();
  });

  it("rejects an uncorrelated response instead of accepting another request's data", async () => {
    const helper = createFakeHelper((request, target) => {
      target.respond({
        protocolVersion: 1,
        requestId: `${String(request.requestId)}-wrong`,
        ok: true,
        result: capabilities,
      });
    });
    const manager = managerFor(helper);
    await expect(manager.capabilities()).rejects.toMatchObject({
      code: "helper-protocol-failed",
    });
    expect(helper.kill).toHaveBeenCalled();
  });

  it("times out a silent command and tears down the stuck helper", async () => {
    vi.useFakeTimers();
    const helper = createFakeHelper();
    const manager = managerFor(helper);
    const request = manager.capabilities();
    const rejected = expect(request).rejects.toMatchObject({
      code: "helper-timeout",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(helper.kill).toHaveBeenCalled();
  });

  it("forwards a sanitized failure lifecycle when an active helper crashes", async () => {
    const helper = createFakeHelper((request, target) => {
      target.respond({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: true,
        result: {
          sessionId: "session-1",
          sourceLabel: "Screen 1",
          sourceKind: "display",
          audioPublished: true,
          audioUnavailableReason: null,
          settings: {
            width: 1280,
            height: 720,
            frameRate: 30,
            maxBitrate: 2_000_000,
          },
          diagnostics: {
            captureBackend: "windows-graphics-capture",
            audioIsolationMode: "exclude-bakbak-process-tree",
          },
        },
      });
    });
    const manager = managerFor(helper);
    const lifecycle = vi.fn();
    manager.onLifecycle(lifecycle);
    await manager.start({
      serverUrl: "wss://example.test",
      token: "secret-token",
      sourceId: "display:1",
      includeAudio: true,
      settings: {
        width: 1280,
        height: 720,
        frameRate: 30,
        maxBitrate: 2_000_000,
      },
    });
    helper.stderr.write("secret-token native stack dump");
    helper.exit();
    expect(lifecycle).toHaveBeenCalledWith({
      sessionId: "session-1",
      state: "failed",
      reasonCode: "helper-exited",
      message: "Native screen sharing ended unexpectedly.",
      audioPublished: false,
    });
    expect(JSON.stringify(lifecycle.mock.calls)).not.toContain("secret-token");
  });

  it("tracks a live lifecycle before the start response for crash cleanup", async () => {
    const helper = createFakeHelper((_request, target) => {
      target.respond({
        protocolVersion: 1,
        event: "lifecycle",
        payload: {
          sessionId: "early-session",
          state: "live",
          audioPublished: true,
        },
      });
      target.exit();
    });
    const manager = managerFor(helper);
    const lifecycle = vi.fn();
    manager.onLifecycle(lifecycle);
    await expect(
      manager.start({
        serverUrl: "wss://example.test",
        token: "secret-token",
        sourceId: "display:1",
        includeAudio: true,
        settings: {
          width: 1280,
          height: 720,
          frameRate: 30,
          maxBitrate: 2_000_000,
        },
      }),
    ).rejects.toMatchObject({ code: "helper-exited" });
    expect(lifecycle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: "early-session",
        state: "failed",
        reasonCode: "helper-exited",
      }),
    );
  });

  it("rejects an oversized remainder after a valid short line", async () => {
    const helper = createFakeHelper((_request, target) => {
      const lifecycle = Buffer.from(
        `${JSON.stringify({
          protocolVersion: 1,
          event: "lifecycle",
          payload: { state: "ready" },
        })}\n`,
      );
      target.stdout.write(
        Buffer.concat([
          lifecycle,
          Buffer.alloc(SCREEN_SHARE_MAX_LINE_BYTES + 1, 0x61),
        ]),
      );
    });
    const manager = managerFor(helper);
    await expect(manager.capabilities()).rejects.toMatchObject({
      code: "helper-protocol-failed",
    });
    expect(helper.kill).toHaveBeenCalled();
  });

  it("rejects credentialed or fragmented websocket URLs before spawn", async () => {
    const helper = createFakeHelper();
    const manager = managerFor(helper);
    const settings = {
      width: 1280,
      height: 720,
      frameRate: 30,
      maxBitrate: 2_000_000,
    };
    await expect(
      manager.start({
        serverUrl: "wss://user:password@example.test",
        token: "token",
        sourceId: "display:1",
        includeAudio: false,
        settings,
      }),
    ).rejects.toThrow("Invalid native screen-share request.");
    await expect(
      manager.start({
        serverUrl: "wss://example.test/#fragment",
        token: "token",
        sourceId: "display:1",
        includeAudio: false,
        settings,
      }),
    ).rejects.toThrow("Invalid native screen-share request.");
    expect(helper.requests).toEqual([]);
  });

  it("rejects audio before spawning the helper when the build gate is off", async () => {
    const helper = createFakeHelper();
    const manager = managerFor(helper, false);
    await expect(
      manager.start({
        serverUrl: "wss://example.test",
        token: "token",
        sourceId: "display:1",
        includeAudio: true,
        settings: {
          width: 1280,
          height: 720,
          frameRate: 30,
          maxBitrate: 2_000_000,
        },
      }),
    ).rejects.toMatchObject({ code: "native-audio-rollout-disabled" });
    expect(helper.requests).toEqual([]);
  });

  it("rejects a session that claims published audio without matching isolation", async () => {
    const helper = createFakeHelper((request, target) => {
      target.respond({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: true,
        result: {
          sessionId: "session-1",
          sourceLabel: "Screen 1",
          sourceKind: "display",
          audioPublished: true,
          audioUnavailableReason: null,
          settings: {
            width: 1280,
            height: 720,
            frameRate: 30,
            maxBitrate: 2_000_000,
          },
          diagnostics: {
            captureBackend: "windows-graphics-capture",
            audioIsolationMode: "disabled",
          },
        },
      });
    });
    const manager = managerFor(helper);
    await expect(
      manager.start({
        serverUrl: "wss://example.test",
        token: "token",
        sourceId: "display:1",
        includeAudio: true,
        settings: {
          width: 1280,
          height: 720,
          frameRate: 30,
          maxBitrate: 2_000_000,
        },
      }),
    ).rejects.toMatchObject({ code: "helper-protocol-failed" });
    expect(helper.kill).toHaveBeenCalled();
  });

  it("masks helper capabilities and source audio when the build gate is off", async () => {
    const helper = createFakeHelper((request, target) => {
      target.respond({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: true,
        result:
          request.command === "capabilities"
            ? capabilities
            : {
                sources: [
                  {
                    id: "display:1",
                    kind: "display",
                    label: "Screen 1",
                    applicationLabel: null,
                    audioAvailable: true,
                    audioUnavailableReason: null,
                    thumbnailDataUrl: null,
                  },
                ],
                truncated: false,
              },
      });
    });
    const manager = managerFor(helper, false);
    await expect(manager.capabilities()).resolves.toMatchObject({
      systemAudio: false,
      applicationAudio: false,
      processTreeIsolation: false,
    });
    const sources = await manager.listSources({});
    expect(sources.sources[0]?.audioAvailable).toBe(false);
    expect(sources.sources[0]?.audioUnavailableReason).toContain(
      "stabilization candidates",
    );
  });

  it("tears down an active window session and can spawn again after activation", async () => {
    const first = createFakeHelper((request, target) => {
      target.respond({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: true,
        result:
          request.command === "stop"
            ? { sessionId: "session-1", stopped: true }
            : {
                sessionId: "session-1",
                sourceLabel: "Screen 1",
                sourceKind: "display",
                audioPublished: false,
                audioUnavailableReason: null,
                settings: {
                  width: 1280,
                  height: 720,
                  frameRate: 30,
                  maxBitrate: 2_000_000,
                },
                diagnostics: {
                  captureBackend: "screen-capture-kit",
                  audioIsolationMode: "disabled",
                },
              },
      });
    });
    const second = createFakeHelper((request, target) => {
      target.respond({
        protocolVersion: 1,
        requestId: request.requestId,
        ok: true,
        result: capabilities,
      });
    });
    const helpers = [first, second];
    let spawnIndex = 0;
    const manager = new ScreenShareHelperManager({
      binaryPath: "/native/bakbak-screen-share-helper",
      electronRootPid: 123,
      bundleId: "com.bakbak.desktop",
      appVersion: "1.7.2",
      nativeAudioEnabled: true,
      spawnHelper: () => helpers[spawnIndex++]?.child ?? second.child,
    });
    await manager.start({
      serverUrl: "wss://example.test",
      token: "token",
      sourceId: "display:1",
      includeAudio: false,
      settings: {
        width: 1280,
        height: 720,
        frameRate: 30,
        maxBitrate: 2_000_000,
      },
    });
    await manager.stopActive();
    expect(first.requests.map((request) => request.command)).toEqual([
      "hello",
      "start",
      "stop",
    ]);
    expect(first.kill).toHaveBeenCalled();
    await expect(manager.capabilities()).resolves.toEqual(capabilities);
    expect(second.requests.map((request) => request.command)).toEqual([
      "hello",
      "capabilities",
    ]);
  });

  it("resolves only packaged/native or the locked development target", () => {
    expect(
      resolveScreenShareHelperPath({
        packaged: true,
        resourcesPath: "/app/resources",
        appPath: "/repo",
        platform: "win32",
      }),
    ).toBe("/app/resources/native/bakbak-screen-share-helper.exe");
    expect(
      resolveScreenShareHelperPath({
        packaged: false,
        resourcesPath: "/app/resources",
        appPath: "/repo",
        platform: "darwin",
      }),
    ).toContain(
      "/repo/native/screen-share-helper/target/debug/bakbak-screen-share-helper",
    );
  });

  it("passes an allowlisted environment without app or service secrets", () => {
    expect(
      helperEnvironment({
        PATH: "/bin",
        TMPDIR: "/tmp",
        BAKBAK_SCREEN_SHARE_HELPER_PATH: "/secret/path",
        VITE_SUPABASE_ANON_KEY: "public-but-unneeded",
        LIVEKIT_API_SECRET: "secret",
      }),
    ).toEqual({ PATH: "/bin", TMPDIR: "/tmp" });
  });
});
