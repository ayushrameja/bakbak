import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateNotice } from "./AppUpdateNotice";
import { AppUpdateProvider } from "./AppUpdateProvider";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  downloadAndInstall: vi.fn(),
  isTauri: vi.fn(),
  openUrl: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));

describe("AppUpdateNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.isTauri.mockReturnValue(true);
    mocks.check.mockResolvedValue({
      version: "0.2.1",
      downloadAndInstall: mocks.downloadAndInstall,
    });
    mocks.downloadAndInstall.mockResolvedValue(undefined);
    mocks.openUrl.mockResolvedValue(undefined);
    mocks.relaunch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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
    expect(mocks.downloadAndInstall).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 600_000 },
    );
    expect(mocks.relaunch).toHaveBeenCalledOnce();
  });

  it("does not call the updater in a normal browser", async () => {
    mocks.isTauri.mockReturnValue(false);
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
});
