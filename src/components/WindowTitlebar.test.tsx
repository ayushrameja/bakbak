import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BakbakDesktopBridge } from "../lib/desktop-runtime";
import { WindowTitlebar } from "./WindowTitlebar";

function renderTitlebar(platform: "macos" | "windows" | "web") {
  return render(<WindowTitlebar showSpaceSwitcher platform={platform} />);
}

describe("WindowTitlebar", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "bakbakDesktop");
  });

  it.each(["macos", "windows", "web"] as const)(
    "leaves native window controls to the %s shell",
    (platform) => {
      renderTitlebar(platform);
      expect(
        screen.queryByRole("group", { name: "Window controls" }),
      ).toBeNull();
    },
  );

  it("renders only a non-layout drag region before the signed-in shell", () => {
    const { container } = render(
      <WindowTitlebar showSpaceSwitcher={false} platform="macos" />,
    );
    expect(container.querySelector(".window-titlebar__drag")).not.toBeNull();
    expect(container.querySelector("header")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Bakbak spaces" }),
    ).toBeNull();
    expect(container.querySelector(".window-titlebar")).toHaveAttribute(
      "data-platform",
      "macos",
    );
    expect(container.querySelector(".window-titlebar")).not.toHaveAttribute(
      "data-sidebar-visible",
    );
  });

  it("keeps the signed-in titlebar overlay free of controls", () => {
    const { container } = render(
      <WindowTitlebar showSpaceSwitcher sidebarVisible platform="web" />,
    );

    expect(container.querySelector(".window-titlebar")).toHaveAttribute(
      "data-sidebar-visible",
      "true",
    );
    expect(
      screen.queryByRole("group", { name: "Sidebar controls" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide sidebar" })).toBeNull();
  });

  it("retains hidden state without adding a reopen control", () => {
    const { container } = render(
      <WindowTitlebar
        showSpaceSwitcher
        sidebarVisible={false}
        platform="macos"
      />,
    );

    expect(screen.queryByRole("button", { name: "Show sidebar" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Sidebar controls" }),
    ).toBeNull();
    expect(container.querySelector(".window-titlebar")).toHaveAttribute(
      "data-sidebar-visible",
      "false",
    );
  });

  it("hides native traffic lights without rendering a reopen control", async () => {
    const setWindowControlsVisible = vi.fn().mockResolvedValue(undefined);
    window.bakbakDesktop = {
      platform: "macos",
      window: { setWindowControlsVisible },
    } as unknown as BakbakDesktopBridge;

    render(<WindowTitlebar showSpaceSwitcher sidebarVisible={false} />);

    await waitFor(() =>
      expect(setWindowControlsVisible).toHaveBeenCalledWith(false, "left"),
    );
    expect(screen.queryByRole("button", { name: "Show sidebar" })).toBeNull();
  });

  it("centers native traffic lights for the right-sidebar drag strip", async () => {
    const setWindowControlsVisible = vi.fn().mockResolvedValue(undefined);
    window.bakbakDesktop = {
      platform: "macos",
      window: { setWindowControlsVisible },
    } as unknown as BakbakDesktopBridge;

    render(
      <WindowTitlebar
        showSpaceSwitcher
        sidebarVisible
        sidebarPosition="right"
      />,
    );

    await waitFor(() =>
      expect(setWindowControlsVisible).toHaveBeenCalledWith(true, "right"),
    );
  });

  it("keeps the pre-shell overlay free of controls and navigation", () => {
    render(<WindowTitlebar showSpaceSwitcher={false} platform="web" />);
    expect(
      screen.queryByRole("group", { name: "Sidebar controls" }),
    ).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Bakbak spaces" }),
    ).toBeNull();
  });

  it("places a separate localized scrim behind native Windows controls", () => {
    const { container } = renderTitlebar("windows");
    expect(
      container.querySelector(".window-controls-overlay-scrim"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        ".window-titlebar .window-controls-overlay-scrim",
      ),
    ).toBeNull();
  });
});
