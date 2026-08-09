import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WindowChromeAdapter } from "../lib/window-chrome";
import { WindowTitlebar } from "./WindowTitlebar";

function createAdapter(
  platform: WindowChromeAdapter["platform"],
  initiallyMaximized = false,
) {
  let maximizedListener: ((maximized: boolean) => void) | undefined;
  const minimize = vi.fn(() => Promise.resolve());
  const toggleMaximize = vi.fn(() => Promise.resolve());
  const close = vi.fn(() => Promise.resolve());
  const startDragging = vi.fn(() => Promise.resolve());
  const onMaximizedChange: WindowChromeAdapter["onMaximizedChange"] = vi.fn(
    (listener: (maximized: boolean) => void) => {
      maximizedListener = listener;
      return Promise.resolve(vi.fn());
    },
  );
  const adapter: WindowChromeAdapter = {
    platform,
    minimize,
    toggleMaximize,
    close,
    startDragging,
    isMaximized: vi.fn(() => Promise.resolve(initiallyMaximized)),
    onMaximizedChange,
  };
  return {
    adapter,
    emitMaximized: (next: boolean) => maximizedListener?.(next),
    spies: { minimize, toggleMaximize, close, startDragging },
  };
}

function renderTitlebar(adapter: WindowChromeAdapter) {
  return render(<WindowTitlebar showSpaceSwitcher chromeAdapter={adapter} />);
}

describe("WindowTitlebar", () => {
  it("controls and drags an undecorated Windows window", async () => {
    const { adapter, emitMaximized, spies } = createAdapter("windows");
    renderTitlebar(adapter);
    await userEvent.click(
      screen.getByRole("button", { name: "Minimize window" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Maximize window" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Close window" }));
    expect(spies.minimize).toHaveBeenCalledOnce();
    expect(spies.toggleMaximize).toHaveBeenCalledOnce();
    expect(spies.close).toHaveBeenCalledOnce();

    act(() => emitMaximized(true));
    expect(
      await screen.findByRole("button", { name: "Restore window" }),
    ).toBeVisible();
  });

  it.each(["macos", "web"] as const)(
    "keeps custom window controls out of the %s titlebar",
    (platform) => {
      const { adapter } = createAdapter(platform);
      renderTitlebar(adapter);
      expect(
        screen.queryByRole("group", { name: "Window controls" }),
      ).toBeNull();
    },
  );

  it("keeps the titlebar center empty and moves space navigation out of chrome", () => {
    const { adapter } = createAdapter("macos");
    const { container } = renderTitlebar(adapter);
    expect(
      container.querySelector(".window-titlebar__center"),
    ).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("navigation", { name: "Bakbak spaces" }),
    ).toBeNull();
    expect(container.querySelector(".window-titlebar")).toHaveAttribute(
      "data-platform",
      "macos",
    );
  });

  it("keeps only one sidebar visibility control in the leading chrome", async () => {
    const onToggleLeftPanel = vi.fn();
    const { adapter } = createAdapter("web");
    render(
      <WindowTitlebar
        showSpaceSwitcher
        panelControls={{
          leftPanelVisible: true,
          disabled: false,
          onToggleLeftPanel,
        }}
        chromeAdapter={adapter}
      />,
    );
    expect(screen.queryByRole("button", { name: /member panel/i })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Hide channel panel" })
        .closest(".window-titlebar__leading"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Hide channel panel" })
        .closest(".window-titlebar__trailing"),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Hide channel panel" }),
    );
    expect(onToggleLeftPanel).toHaveBeenCalledOnce();
  });

  it("keeps the pre-shell titlebar free of status and navigation", () => {
    const { adapter } = createAdapter("web");
    render(
      <WindowTitlebar showSpaceSwitcher={false} chromeAdapter={adapter} />,
    );
    expect(
      document.querySelector(".window-titlebar__center"),
    ).toBeEmptyDOMElement();
    expect(screen.queryByRole("group", { name: "Panel controls" })).toBeNull();
  });
});
