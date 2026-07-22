import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WindowChromeAdapter } from "../lib/window-chrome";
import { TITLEBAR_MESSAGE_ROTATION_MS, WindowTitlebar } from "./WindowTitlebar";

function createAdapter(
  platform: WindowChromeAdapter["platform"],
  initiallyMaximized = false,
) {
  let maximizedListener: ((maximized: boolean) => void) | undefined;
  const minimize = vi.fn(() => Promise.resolve());
  const toggleMaximize = vi.fn(() => Promise.resolve());
  const close = vi.fn(() => Promise.resolve());
  const startDragging = vi.fn(() => Promise.resolve());
  const isMaximized = vi.fn(() => Promise.resolve(initiallyMaximized));
  const onMaximizedChange = vi.fn((listener: (maximized: boolean) => void) => {
    maximizedListener = listener;
    return Promise.resolve(vi.fn());
  });
  const adapter: WindowChromeAdapter = {
    platform,
    minimize,
    toggleMaximize,
    close,
    startDragging,
    isMaximized,
    onMaximizedChange,
  };
  return {
    adapter,
    emitMaximized: (next: boolean) => maximizedListener?.(next),
    spies: { minimize, toggleMaximize, close, startDragging },
  };
}

function renderTitlebar(adapter: WindowChromeAdapter) {
  return render(
    <WindowTitlebar
      showSpaceSwitcher
      activeSpace="server"
      personalUnread={false}
      serverUnread={false}
      callActive={false}
      serverAvailable
      switchDisabled={false}
      onSelectSpace={vi.fn()}
      chromeAdapter={adapter}
    />,
  );
}

describe("WindowTitlebar", () => {
  it("controls and drags an undecorated Windows window", async () => {
    const { adapter, emitMaximized, spies } = createAdapter("windows");
    const { container } = renderTitlebar(adapter);

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
    expect(spies.startDragging).not.toHaveBeenCalled();

    const dragRegion = container.querySelector(
      ".window-titlebar__drag--leading",
    );
    expect(dragRegion).not.toBeNull();
    fireEvent.mouseDown(dragRegion!, { button: 0 });
    expect(spies.startDragging).toHaveBeenCalledOnce();
    fireEvent.doubleClick(dragRegion!);
    expect(spies.toggleMaximize).toHaveBeenCalledTimes(2);

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
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Personal" })).toBeVisible();
    },
  );

  it("keeps the space switch left and the signed-in title independently centered", () => {
    const { adapter } = createAdapter("macos");
    const { container } = renderTitlebar(adapter);
    const switcher = screen.getByRole("navigation", {
      name: "Bakbak spaces",
    });

    expect(switcher.parentElement).toHaveClass("window-titlebar__leading");
    const centeredTitle = screen.getByText("OG Nahan Gang").parentElement;
    expect(centeredTitle).toHaveClass("window-titlebar__center");
    expect(container.querySelector(".window-titlebar")).toHaveAttribute(
      "data-platform",
      "macos",
    );
  });

  it("rotates idle jokes and switches immediately to voice context", () => {
    vi.useFakeTimers();
    const { adapter } = createAdapter("web");
    const view = renderTitlebar(adapter);
    expect(screen.getByText("OG Nahan Gang")).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(TITLEBAR_MESSAGE_ROTATION_MS);
    });
    expect(screen.getByText("Professional yappers")).toBeVisible();

    view.rerender(
      <WindowTitlebar
        showSpaceSwitcher
        activeSpace="server"
        personalUnread={false}
        serverUnread={false}
        callActive
        callStatus="connected"
        callChannelName="Queue"
        serverAvailable
        switchDisabled={false}
        onSelectSpace={vi.fn()}
        chromeAdapter={adapter}
      />,
    );
    expect(screen.getByText("Queue: chaos connected")).toBeVisible();
    view.unmount();
    vi.useRealTimers();
  });

  it("uses every non-control titlebar region for native dragging and maximize", () => {
    const { adapter, spies } = createAdapter("macos");
    const { container } = renderTitlebar(adapter);
    const titlebar = container.querySelector(".window-titlebar");
    const leading = container.querySelector(".window-titlebar__leading");
    const center = container.querySelector(".window-titlebar__center");
    const trailing = container.querySelector(".window-titlebar__trailing");
    const titleText = screen.getByText("OG Nahan Gang");
    const dragTargets = [titlebar, leading, center, trailing, titleText];

    dragTargets.forEach((target) => {
      expect(target).not.toBeNull();
      fireEvent.mouseDown(target!, { button: 0 });
    });
    expect(spies.startDragging).toHaveBeenCalledTimes(dragTargets.length);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Personal" }), {
      button: 0,
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: "Personal" }));
    expect(spies.startDragging).toHaveBeenCalledTimes(dragTargets.length);
    expect(spies.toggleMaximize).not.toHaveBeenCalled();

    [titlebar, leading, center, trailing].forEach((target) => {
      fireEvent.doubleClick(target!);
    });
    expect(spies.toggleMaximize).toHaveBeenCalledTimes(4);
  });

  it("puts both panel toggles at the right side of the titlebar", async () => {
    const onToggleLeftPanel = vi.fn();
    const onToggleRightPanel = vi.fn();
    const { adapter, spies } = createAdapter("web");
    render(
      <WindowTitlebar
        showSpaceSwitcher
        activeSpace="server"
        personalUnread={false}
        serverUnread={false}
        callActive={false}
        serverAvailable
        switchDisabled={false}
        onSelectSpace={vi.fn()}
        panelControls={{
          leftPanelVisible: true,
          rightPanelVisible: false,
          disabled: false,
          onToggleLeftPanel,
          onToggleRightPanel,
        }}
        chromeAdapter={adapter}
      />,
    );

    const controls = screen.getByRole("group", { name: "Panel controls" });
    expect(controls.parentElement).toHaveClass("window-titlebar__trailing");
    await userEvent.click(
      screen.getByRole("button", { name: "Hide channel panel" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Show member panel" }),
    );
    expect(onToggleLeftPanel).toHaveBeenCalledOnce();
    expect(onToggleRightPanel).toHaveBeenCalledOnce();
    expect(spies.startDragging).not.toHaveBeenCalled();
  });

  it("keeps the pre-shell titlebar free of branding and navigation", () => {
    const { adapter, spies } = createAdapter("web");
    const { container } = render(
      <WindowTitlebar
        showSpaceSwitcher={false}
        activeSpace="server"
        personalUnread={false}
        serverUnread={false}
        callActive={false}
        serverAvailable={false}
        switchDisabled={false}
        onSelectSpace={vi.fn()}
        chromeAdapter={adapter}
      />,
    );
    fireEvent.mouseDown(container.querySelector(".window-titlebar")!, {
      button: 0,
    });
    expect(spies.startDragging).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Bakbak")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Bakbak spaces" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Panel controls" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("OG Nahan Gang")).not.toBeInTheDocument();
  });
});
