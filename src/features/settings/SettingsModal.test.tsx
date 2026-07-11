import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal microphone selection", () => {
  it("disables the selector and explains why while voice is connecting", () => {
    render(
      <SettingsModal
        inputDevices={[]}
        selectedInputId="default"
        inputError={null}
        inputDisabled
        onInputChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Input device" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Finish connecting before changing microphones."),
    ).toBeVisible();
  });
});
