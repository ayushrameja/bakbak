import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenShareDialog } from "./ScreenShareDialog";
import { DEFAULT_SCREEN_SHARE_SETTINGS } from "./screen-share-preferences";

const sourcePicker = vi.hoisted(() => ({
  list: vi.fn(),
  openSettings: vi.fn(),
  restart: vi.fn(),
}));

vi.mock("./screen-share-service", () => ({
  listScreenShareSources: sourcePicker.list,
  openPermissionSettings: sourcePicker.openSettings,
  restartDesktopApp: sourcePicker.restart,
}));

function successfulSourceResult(sources: unknown[]) {
  return {
    ok: true,
    sources,
    permissionStatus: "granted",
    systemAudioAvailable: true,
    systemAudioUnavailableReason: null,
    failure: null,
  };
}

function failedSourceResult({
  message,
  canOpenSettings = false,
  restartRequired = false,
}: {
  message: string;
  canOpenSettings?: boolean;
  restartRequired?: boolean;
}) {
  return {
    ok: false,
    sources: [],
    permissionStatus: canOpenSettings ? "denied" : "unknown",
    systemAudioAvailable: false,
    systemAudioUnavailableReason: null,
    failure: {
      code: canOpenSettings ? "permission-denied" : "unknown",
      message,
      canOpenSettings,
      restartRequired,
    },
  };
}

describe("ScreenShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults system audio on when matched audio is available", async () => {
    const onStart = vi.fn();
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "Include system audio" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/not isolated to this display/i)).toBeVisible();
    expect(
      screen.queryByText(/voice chat is excluded/i),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Choose source" }),
    );
    expect(onStart).toHaveBeenCalledWith(true, DEFAULT_SCREEN_SHARE_SETTINGS);
  });

  it("disables audio while retaining video-only sharing", () => {
    render(
      <ScreenShareDialog
        audioAvailable={false}
        audioUnavailableReason="Audio needs a newer operating system."
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "Include system audio" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Audio needs a newer operating system."),
    ).toBeVisible();
  });

  it("allows independent quality and frame-rate selection", async () => {
    const onStart = vi.fn();
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Screen share resolution" }),
      "720",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Screen share frame rate" }),
      "30",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Choose source" }),
    );

    expect(onStart).toHaveBeenCalledWith(true, {
      resolution: 720,
      frameRate: 30,
    });
  });

  it("uses Entire screen and Application tabs and forwards the source id", async () => {
    sourcePicker.list.mockResolvedValue(
      successfulSourceResult([
        {
          id: "display:1",
          kind: "display",
          label: "Screen 1",
          applicationLabel: null,
          audioAvailable: true,
          audioUnavailableReason: null,
          thumbnailDataUrl: null,
        },
        {
          id: "window:2",
          kind: "application",
          label: "Project",
          applicationLabel: "Editor",
          audioAvailable: true,
          audioUnavailableReason: null,
          thumbnailDataUrl: "data:image/bmp;base64,Qk0=",
        },
      ]),
    );
    const onStart = vi.fn();
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        customPicker
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );

    await userEvent.click(
      await screen.findByRole("tab", { name: "Application" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Project/ }),
    );
    expect(screen.getByRole("button", { name: /Project/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(
      screen.getByRole("switch", { name: "Include system audio" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(onStart).toHaveBeenCalledWith(
      false,
      DEFAULT_SCREEN_SHARE_SETTINGS,
      "window:2",
    );
  });

  it("preserves an explicit audio choice while switching sources", async () => {
    sourcePicker.list.mockResolvedValue(
      successfulSourceResult([
        {
          id: "display:1",
          kind: "display",
          label: "Screen 1",
          applicationLabel: null,
          audioAvailable: true,
          audioUnavailableReason: null,
          thumbnailDataUrl: null,
        },
        {
          id: "window:2",
          kind: "application",
          label: "Project",
          applicationLabel: "Editor",
          audioAvailable: true,
          audioUnavailableReason: null,
          thumbnailDataUrl: null,
        },
      ]),
    );
    const onStart = vi.fn();
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        customPicker
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );

    const audioSwitch = screen.getByRole("switch", {
      name: "Include system audio",
    });
    await screen.findByRole("button", { name: /Screen 1/ });
    await waitFor(() => expect(audioSwitch).toBeEnabled());
    await userEvent.click(audioSwitch);
    await userEvent.click(
      await screen.findByRole("tab", { name: "Application" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Project/ }),
    );

    expect(audioSwitch).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(onStart).toHaveBeenCalledWith(
      false,
      DEFAULT_SCREEN_SHARE_SETTINGS,
      "window:2",
    );
  });

  it("never requests audio for a selected video-only source", async () => {
    sourcePicker.list.mockResolvedValue(
      successfulSourceResult([
        {
          id: "display:1",
          kind: "display",
          label: "Screen 1",
          applicationLabel: null,
          audioAvailable: true,
          audioUnavailableReason: null,
          thumbnailDataUrl: null,
        },
        {
          id: "window:2",
          kind: "application",
          label: "Project",
          applicationLabel: "Editor",
          audioAvailable: false,
          audioUnavailableReason:
            "Application audio is disabled until isolation is verified.",
          thumbnailDataUrl: null,
        },
      ]),
    );
    const onStart = vi.fn();
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        customPicker
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );

    await userEvent.click(
      await screen.findByRole("tab", { name: "Application" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Project/ }),
    );
    expect(
      screen.getByRole("switch", { name: "Include system audio" }),
    ).toBeDisabled();
    expect(screen.getByText(/isolation is verified/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(onStart).toHaveBeenCalledWith(
      false,
      DEFAULT_SCREEN_SHARE_SETTINGS,
      "window:2",
    );
  });

  it("shows a retryable empty state when source enumeration fails", async () => {
    sourcePicker.list
      .mockResolvedValueOnce(
        failedSourceResult({
          message: "Bakbak could not list screens or applications.",
        }),
      )
      .mockResolvedValueOnce(
        successfulSourceResult([
          {
            id: "display:1",
            kind: "display",
            label: "Screen 1",
            applicationLabel: null,
            audioAvailable: true,
            audioUnavailableReason: null,
            thumbnailDataUrl: null,
          },
        ]),
      );
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        customPicker
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bakbak could not list screens or applications.",
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Screen 1/ })).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
  });

  it("offers settings and restart recovery for macOS permission failures", async () => {
    sourcePicker.list.mockResolvedValueOnce(
      failedSourceResult({
        message:
          "Allow Bakbak in macOS Privacy & Security > Screen Recording, then restart Bakbak.",
        canOpenSettings: true,
        restartRequired: true,
      }),
    );
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        customPicker
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Open Privacy Settings" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restart Bakbak" }),
    );
    expect(sourcePicker.openSettings).toHaveBeenCalledWith("screen");
    expect(sourcePicker.restart).toHaveBeenCalledOnce();
  });

  it("silently rechecks a structured source failure when the app regains focus", async () => {
    sourcePicker.list
      .mockResolvedValueOnce(
        failedSourceResult({
          message: "Allow Bakbak in Screen Recording.",
          canOpenSettings: true,
        }),
      )
      .mockResolvedValueOnce(
        successfulSourceResult([
          {
            id: "display:1",
            kind: "display",
            label: "Screen 1",
            applicationLabel: null,
            audioAvailable: false,
            audioUnavailableReason: "Video-only capture is available.",
            thumbnailDataUrl: null,
          },
        ]),
      );
    render(
      <ScreenShareDialog
        audioAvailable={false}
        audioUnavailableReason="Video-only capture is available."
        customPicker
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Allow Bakbak in Screen Recording.",
    );
    fireEvent.focus(window);

    expect(
      await screen.findByRole("button", { name: /Screen 1/ }),
    ).toBeVisible();
    expect(sourcePicker.list).toHaveBeenCalledTimes(2);
  });

  it("does not offer fake Windows screen-permission recovery", async () => {
    sourcePicker.list.mockResolvedValueOnce(
      failedSourceResult({
        message:
          "Windows has no Bakbak-specific screen-capture permission; retry, or check device policy.",
      }),
    );
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        customPicker
        initialSettings={DEFAULT_SCREEN_SHARE_SETTINGS}
        onStart={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Windows has no Bakbak-specific screen-capture permission",
    );
    expect(
      screen.queryByRole("button", { name: "Open Privacy Settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Restart Bakbak" }),
    ).not.toBeInTheDocument();
  });
});
