import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScreenShareDialog } from "./ScreenShareDialog";
import { DEFAULT_SCREEN_SHARE_SETTINGS } from "./screen-share-preferences";

const sourcePicker = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("./screen-share-service", () => ({
  listScreenShareSources: sourcePicker.list,
}));

describe("ScreenShareDialog", () => {
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
    sourcePicker.list.mockResolvedValue([
      {
        id: "display:1",
        kind: "display",
        label: "Screen 1",
        applicationLabel: null,
        audioAvailable: true,
        thumbnailDataUrl: null,
      },
      {
        id: "window:2",
        kind: "application",
        label: "Project",
        applicationLabel: "Editor",
        audioAvailable: true,
        thumbnailDataUrl: "data:image/bmp;base64,Qk0=",
      },
    ]);
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
    sourcePicker.list.mockResolvedValue([
      {
        id: "display:1",
        kind: "display",
        label: "Screen 1",
        applicationLabel: null,
        audioAvailable: true,
        thumbnailDataUrl: null,
      },
      {
        id: "window:2",
        kind: "application",
        label: "Project",
        applicationLabel: "Editor",
        audioAvailable: true,
        thumbnailDataUrl: null,
      },
    ]);
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
    sourcePicker.list.mockResolvedValue([
      {
        id: "display:1",
        kind: "display",
        label: "Screen 1",
        applicationLabel: null,
        audioAvailable: true,
        thumbnailDataUrl: null,
      },
      {
        id: "window:2",
        kind: "application",
        label: "Project",
        applicationLabel: "Editor",
        audioAvailable: false,
        thumbnailDataUrl: null,
      },
    ]);
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
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(onStart).toHaveBeenCalledWith(
      false,
      DEFAULT_SCREEN_SHARE_SETTINGS,
      "window:2",
    );
  });

  it("shows a retryable empty state when source enumeration fails", async () => {
    sourcePicker.list
      .mockRejectedValueOnce(
        "Allow Bakbak under Privacy & Security, then relaunch it.",
      )
      .mockResolvedValueOnce([
        {
          id: "display:1",
          kind: "display",
          label: "Screen 1",
          applicationLabel: null,
          audioAvailable: true,
          thumbnailDataUrl: null,
        },
      ]);
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
      "Allow Bakbak under Privacy & Security, then relaunch it.",
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Screen 1/ })).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
  });
});
