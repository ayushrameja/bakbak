import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SidebarGradientPicker } from "./SidebarGradientPicker";
import {
  DEFAULT_SIDEBAR_THEME_PREFERENCES,
  sidebarThemeStyle,
  type SpaceSidebarTheme,
} from "./sidebar-theme-preferences";

function PickerHarness() {
  const [theme, setTheme] = useState<SpaceSidebarTheme>(() =>
    structuredClone(DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.server),
  );
  return (
    <>
      <SidebarGradientPicker label="Bakbak" theme={theme} onChange={setTheme} />
      <output data-testid="theme">{JSON.stringify(theme)}</output>
    </>
  );
}

function renderedTheme(): SpaceSidebarTheme {
  const parsed: unknown = JSON.parse(
    screen.getByTestId("theme").textContent ?? "null",
  );
  return parsed as SpaceSidebarTheme;
}

describe("SidebarGradientPicker", () => {
  it("offers three color points and applies a preset", async () => {
    render(<PickerHarness />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByLabelText("Bakbak color 1")).toHaveAttribute(
      "type",
      "color",
    );
    expect(screen.getByRole("group", { name: "Color presets" })).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Lagoon preset" }),
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("#21c5bd");
    expect(screen.getByTestId("theme")).toHaveTextContent('"mode":"gradient"');
  });

  it("moves a point accessibly and changes the rendered gradient direction", () => {
    render(<PickerHarness />);
    const color = screen.getByLabelText("Bakbak color 1");
    const before = renderedTheme();
    fireEvent.keyDown(color, { key: "ArrowRight", altKey: true });
    const after = renderedTheme();
    expect(after.points[0].x).toBe(before.points[0].x + 2);
    expect(sidebarThemeStyle(after)["--space-gradient"]).not.toBe(
      sidebarThemeStyle(before)["--space-gradient"],
    );
  });
});
