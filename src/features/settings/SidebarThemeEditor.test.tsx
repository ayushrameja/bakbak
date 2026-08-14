import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SidebarThemeEditor } from "./SidebarThemeEditor";
import {
  DEFAULT_SIDEBAR_THEME_PREFERENCES,
  type SidebarThemePreferences,
} from "./sidebar-theme-preferences";

function ThemeEditorHarness({
  initial = DEFAULT_SIDEBAR_THEME_PREFERENCES,
}: {
  initial?: SidebarThemePreferences;
}) {
  const [preferences, setPreferences] = useState(() =>
    structuredClone(initial),
  );
  return (
    <>
      <SidebarThemeEditor value={preferences} onChange={setPreferences} />
      <output data-testid="preferences">{JSON.stringify(preferences)}</output>
    </>
  );
}

function renderedPreferences(): SidebarThemePreferences {
  return JSON.parse(
    screen.getByTestId("preferences").textContent ?? "null",
  ) as SidebarThemePreferences;
}

describe("SidebarThemeEditor", () => {
  it("starts transparent, omits Solid, and keeps color controls out of the way", () => {
    render(<ThemeEditorHarness />);

    expect(
      screen.getByRole("group", { name: "Chrome appearance" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Glass" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("img", { name: "Bakbak liquid glass preview" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Bakbak color 1")).toBeNull();
    expect(screen.queryByLabelText("Bakbak shade")).toBeNull();
    expect(screen.queryByRole("button", { name: "Solid" })).toBeNull();
    expect(screen.getByLabelText("Bakbak transparency")).toHaveAttribute(
      "min",
      "20",
    );
    expect(screen.getByLabelText("Bakbak transparency")).toHaveAttribute(
      "max",
      "100",
    );
  });

  it("reveals optional controls for a gradient and preserves them through glass", async () => {
    const user = userEvent.setup();
    render(<ThemeEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Gradient" }));
    expect(screen.getByLabelText("Bakbak color 1")).toBeVisible();
    expect(screen.getByLabelText("Bakbak color 2")).toBeVisible();
    expect(screen.getByLabelText("Bakbak color 3")).toBeVisible();
    expect(screen.getByLabelText("Bakbak shade")).toBeVisible();
    expect(screen.getByLabelText("Bakbak transparency")).toBeVisible();
    expect(screen.getByRole("group", { name: "Texture" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Lagoon preset" }));
    await user.click(screen.getByRole("button", { name: "Dots" }));
    const customColors = renderedPreferences().spaces.server.colors;
    await user.click(screen.getByRole("button", { name: "Glass" }));
    expect(screen.queryByLabelText("Bakbak color 1")).toBeNull();
    expect(screen.getByLabelText("Bakbak transparency")).toBeVisible();
    expect(renderedPreferences().spaces.server.colors).toEqual(customColors);
    expect(renderedPreferences().spaces.server.texture).toBe("dots");

    await user.click(screen.getByRole("button", { name: "Gradient" }));
    expect(renderedPreferences().spaces.server.colors).toEqual(customColors);
    expect(screen.getByRole("button", { name: "Dots" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("customizes transparency independently and reset restores glass", async () => {
    const user = userEvent.setup();
    render(<ThemeEditorHarness />);

    const spacePicker = screen.getByRole("group", { name: "Chrome space" });
    await user.click(
      within(spacePicker).getByRole("button", { name: "Personal" }),
    );
    fireEvent.change(screen.getByLabelText("Personal transparency"), {
      target: { value: "80" },
    });
    expect(renderedPreferences().spaces.personal.transparency).toBe(80);
    expect(renderedPreferences().spaces.server.transparency).toBe(100);

    await user.click(
      screen.getByRole("button", { name: "Reset Personal appearance" }),
    );
    expect(renderedPreferences().spaces.personal).toEqual(
      DEFAULT_SIDEBAR_THEME_PREFERENCES.spaces.personal,
    );
  });
});
