import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScreenShareDialog } from "./ScreenShareDialog";

describe("ScreenShareDialog", () => {
  it("requires an explicit audio opt-in for every share", async () => {
    const onStart = vi.fn();
    render(
      <ScreenShareDialog
        audioAvailable
        audioUnavailableReason={null}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Open system picker" }),
    );
    expect(onStart).toHaveBeenCalledWith(false);
  });

  it("disables audio while retaining video-only sharing", () => {
    render(
      <ScreenShareDialog
        audioAvailable={false}
        audioUnavailableReason="Audio needs a newer operating system."
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
});
