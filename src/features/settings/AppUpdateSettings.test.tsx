import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateProvider } from "./AppUpdateProvider";
import { AppUpdateSettings } from "./AppUpdateSettings";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  isTauri: vi.fn(),
  openUrl: vi.fn(),
  relaunch: vi.fn(),
  writeText: vi.fn<(value: string) => Promise<void>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));

describe("AppUpdateSettings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    mocks.isTauri.mockReturnValue(true);
    mocks.openUrl.mockResolvedValue(undefined);
    mocks.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("retries timed-out checks and offers the release-page fallback", async () => {
    mocks.check.mockRejectedValue(new Error("request timed out"));
    render(
      <AppUpdateProvider autoCheck={false} retryDelaysMs={[1, 1]}>
        <AppUpdateSettings />
      </AppUpdateProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.check).toHaveBeenCalledTimes(3);
    expect(mocks.check).toHaveBeenNthCalledWith(1, { timeout: 60_000 });
    expect(
      screen.getByText("The update service did not respond"),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Open GitHub releases" }),
    );
    await act(async () => Promise.resolve());
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://github.com/ayushrameja/bakbak/releases",
    );
  });

  it("reports a successful manual check and persists its time", async () => {
    mocks.check.mockResolvedValue(null);
    render(
      <AppUpdateProvider autoCheck={false} retryDelaysMs={[]}>
        <AppUpdateSettings />
      </AppUpdateProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await act(async () => Promise.resolve());

    expect(screen.getByText("Bakbak is up to date")).toBeVisible();
    expect(
      window.localStorage.getItem("bakbak:update:last-successful-check:v1"),
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("copies privacy-safe update diagnostics", async () => {
    render(
      <AppUpdateProvider autoCheck={false} retryDelaysMs={[]}>
        <AppUpdateSettings />
      </AppUpdateProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy update diagnostics" }),
    );
    await act(async () => Promise.resolve());

    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(mocks.writeText).toHaveBeenCalledOnce();
    const diagnosticsText = mocks.writeText.mock.calls[0]?.[0];
    if (!diagnosticsText) throw new Error("Expected copied diagnostics.");
    const diagnostics: unknown = JSON.parse(diagnosticsText);
    if (!diagnostics || typeof diagnostics !== "object") {
      throw new Error("Expected structured diagnostics.");
    }
    const diagnosticRecord = diagnostics as Record<string, unknown>;
    expect(diagnosticRecord).toMatchObject({
      status: "idle",
      failure: null,
    });
    expect(typeof diagnosticRecord.appVersion).toBe("string");
    expect(typeof diagnosticRecord.online).toBe("boolean");
    expect(JSON.stringify(diagnostics)).not.toMatch(
      /email|message|credential|token/i,
    );
  });
});
