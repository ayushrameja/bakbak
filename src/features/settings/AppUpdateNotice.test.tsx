import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BakbakDesktopBridge } from "../../lib/desktop-runtime";
import { AppUpdateNotice } from "./AppUpdateNotice";
import { AppUpdateProvider } from "./AppUpdateProvider";
import { useAppUpdate } from "./app-update-context";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  downloadAndInstall: vi.fn(),
  openExternal: vi.fn(),
  installErrorListener: null as (() => void) | null,
}));

function installDesktopBridge(
  deliveryMode: "automatic" | "manual" = "automatic",
): void {
  window.bakbakDesktop = {
    platform: deliveryMode === "manual" ? "macos" : "windows",
    updates: {
      deliveryMode,
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

function ManualUpdateNoticeHarness() {
  const updater = useAppUpdate();
  return (
    <>
      <button type="button" onClick={() => void updater.checkForUpdates()}>
        Check manually
      </button>
      <AppUpdateNotice />
    </>
  );
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

  it("recovers when the automatic updater rejects an archive", async () => {
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

  it("never auto-checks or installs in-app in manual macOS mode", async () => {
    installDesktopBridge("manual");
    render(
      <AppUpdateProvider startupDelayMs={1} retryDelaysMs={[]}>
        <ManualUpdateNoticeHarness />
      </AppUpdateProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.check).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Check manually" }));
    await act(async () => Promise.resolve());
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/replace it in Applications.*granted again/i),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Download DMG" }));
    await act(async () => Promise.resolve());

    expect(mocks.openExternal).toHaveBeenCalledWith(
      "https://github.com/ayushrameja/bakbak/releases",
    );
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();
  });
});
