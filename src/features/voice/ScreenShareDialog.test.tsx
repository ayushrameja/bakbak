import { render, screen } from "@testing-library/react";
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
  it("requires an explicit audio opt-in for every share", async () => {
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

    await userEvent.click(
      screen.getByRole("button", { name: "Choose source" }),
    );
    expect(onStart).toHaveBeenCalledWith(false, DEFAULT_SCREEN_SHARE_SETTINGS);
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
      screen.getByRole("checkbox", { name: /Include system audio/i }),
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

    expect(onStart).toHaveBeenCalledWith(false, {
      resolution: 720,
      frameRate: 30,
    });
  });

  it("uses the Windows source tabs and forwards the validated source id", async () => {
    sourcePicker.list.mockResolvedValue([
      {
        id: "display:1",
        kind: "display",
        label: "Screen 1",
        applicationLabel: null,
        audioAvailable: false,
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
      await screen.findByRole("tab", { name: "Applications" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Project/ }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Include system audio/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Choose source" }),
    );

    expect(onStart).toHaveBeenCalledWith(
      true,
      DEFAULT_SCREEN_SHARE_SETTINGS,
      "window:2",
    );
  });
});
