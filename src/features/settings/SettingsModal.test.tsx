import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal microphone selection", () => {
  it("disables the selector and explains why while voice is connecting", () => {
    render(
      <SettingsModal
        inputDevices={[]}
        outputDevices={[]}
        cameraDevices={[]}
        selectedInputId="default"
        selectedOutputId="default"
        selectedCameraId="default"
        inputError={null}
        outputError={null}
        cameraError={null}
        inputDisabled
        outputSelectionSupported={false}
        onInputChange={vi.fn()}
        onOutputChange={vi.fn()}
        onCameraChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Input device" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Finish connecting before changing microphones."),
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Speaker" })).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Video device" }),
    ).toBeDisabled();
    expect(screen.getByText(/System output only/)).toBeVisible();
  });
});
