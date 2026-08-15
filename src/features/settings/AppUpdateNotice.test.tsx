import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BakbakDesktopBridge } from "../../lib/desktop-runtime";
import { AppUpdateNotice } from "./AppUpdateNotice";
import { AppUpdateProvider } from "./AppUpdateProvider";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  downloadAndInstall: vi.fn(),
  openExternal: vi.fn(),
  installErrorListener: null as (() => void) | null,
}));

function installDesktopBridge(): void {
  window.bakbakDesktop = {
    platform: "macos",
    updates: {
      check: mocks.check,
      downloadAndInstall: mocks.downloadAndInstall,
      onProgress: () => () => undefined,
      onInstallError: (listener: () => void) => {
        mocks.installErrorListener = listener;
        return () => {
          if (mocks.installErrorListener === listener) {
            mocks.installErrorListener = null;
          }
        };
      },
    },
    external: { open: mocks.openExternal },
  } as unknown as BakbakDesktopBridge;
}

describe("AppUpdateNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installDesktopBridge();
    mocks.check.mockResolvedValue({
      supported: true,
      available: true,
      version: "0.2.1",
    });
    mocks.downloadAndInstall.mockResolvedValue(undefined);
    mocks.openExternal.mockResolvedValue(undefined);
    mocks.installErrorListener = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "bakbakDesktop");
  });

  it("checks in the desktop runtime and installs only after confirmation", async () => {
    render(
      <AppUpdateProvider startupDelayMs={1} retryDelaysMs={[]}>
        <AppUpdateNotice />
      </AppUpdateProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    expect(screen.getByText("Bakbak 0.2.1 is ready")).toBeVisible();
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Update and restart" }),
      );
      await Promise.resolve();
    });

    expect(mocks.downloadAndInstall).toHaveBeenCalledOnce();
    expect(mocks.downloadAndInstall).toHaveBeenCalledWith(600_000);
  });

  it("does not call the updater in a normal browser", async () => {
    Reflect.deleteProperty(window, "bakbakDesktop");
    render(
      <AppUpdateProvider startupDelayMs={1} retryDelaysMs={[]}>
        <AppUpdateNotice />
      </AppUpdateProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("recovers when macOS rejects an update after the archive downloads", async () => {
    render(
      <AppUpdateProvider startupDelayMs={1} retryDelaysMs={[]}>
        <AppUpdateNotice />
      </AppUpdateProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Update and restart" }));
    await act(async () => Promise.resolve());
    act(() => mocks.installErrorListener?.());

    expect(
      screen.getByText(
        "The update could not be installed. Your current app is unchanged.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
