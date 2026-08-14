import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const { container } = renderTitlebar("macos");
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

  it("keeps one keyboard-described sidebar visibility control", async () => {
    const onToggleSidebar = vi.fn();
    render(
      <WindowTitlebar
        showSpaceSwitcher
        panelControls={{
          sidebarVisible: true,
          disabled: false,
          onToggleSidebar,
        }}
        platform="web"
      />,
    );

    const toggle = screen.getByRole("button", { name: "Hide sidebar" });
    expect(toggle.closest(".window-titlebar")).toHaveAttribute(
      "data-sidebar-visible",
      "true",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-keyshortcuts", "Meta+B Control+B");
    expect(toggle).toHaveAttribute("aria-controls", "context-panel");
    await userEvent.click(toggle);
    expect(onToggleSidebar).toHaveBeenCalledOnce();
  });

  it("removes the sidebar control when the sidebar is hidden", () => {
    const { container } = render(
      <WindowTitlebar
        showSpaceSwitcher
        panelControls={{
          sidebarVisible: false,
          disabled: false,
          onToggleSidebar: vi.fn(),
        }}
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

    render(
      <WindowTitlebar
        showSpaceSwitcher
        panelControls={{
          sidebarVisible: false,
          disabled: false,
          onToggleSidebar: vi.fn(),
        }}
      />,
    );

    await waitFor(() =>
      expect(setWindowControlsVisible).toHaveBeenCalledWith(false),
    );
    expect(screen.queryByRole("button", { name: "Show sidebar" })).toBeNull();
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
