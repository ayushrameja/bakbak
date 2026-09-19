import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import type { SidebarPosition } from "../features/settings/layout-preferences";
import { getDesktopBridge } from "../lib/desktop-runtime";

interface WindowTitlebarProps {
  showSpaceSwitcher: boolean;
  sidebarVisible?: boolean;
  sidebarPosition?: SidebarPosition;
  platform?: "macos" | "windows" | "web";
}

export function WindowTitlebar({
  showSpaceSwitcher,
  sidebarVisible = false,
  sidebarPosition = "left",
  platform,
}: WindowTitlebarProps) {
  const desktopWindow = getDesktopBridge()?.window;
  const runtimePlatform = platform ?? getDesktopBridge()?.platform ?? "web";
  const rendererWindowControls =
    runtimePlatform === "windows" && desktopWindow?.controlsMode === "renderer";
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const desktopWindow = getDesktopBridge()?.window;
    if (runtimePlatform !== "macos") return;
    if (!desktopWindow?.setWindowControlsVisible) return;
    const visible = !showSpaceSwitcher || sidebarVisible;
    void desktopWindow
      .setWindowControlsVisible(visible, sidebarPosition)
      .catch(() => undefined);
  }, [runtimePlatform, showSpaceSwitcher, sidebarPosition, sidebarVisible]);

  useEffect(() => {
    if (!rendererWindowControls || !desktopWindow?.isMaximized) return;
    let disposed = false;
    void desktopWindow
      .isMaximized()
      .then((next) => {
        if (!disposed) setMaximized(next);
      })
      .catch(() => undefined);
    const stop = desktopWindow.onMaximizedChange?.((next) => {
      if (!disposed) setMaximized(next);
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [desktopWindow, rendererWindowControls]);

  useEffect(
    () => () => {
      void getDesktopBridge()
        ?.window.setWindowControlsVisible?.(true, "left")
        .catch(() => undefined);
    },
    [],
  );

  const run = (action: (() => Promise<void>) | undefined) => {
    if (action) void action().catch(() => undefined);
  };

  const startDragging = (event: MouseEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    run(desktopWindow?.startDragging?.bind(desktopWindow));
  };

  return (
    <>
      {runtimePlatform === "windows" && !rendererWindowControls ? (
        <span className="window-controls-overlay-scrim" aria-hidden="true" />
      ) : null}
      {rendererWindowControls ? (
        <>
          <span
            className="tauri-window-drag-region"
            aria-hidden="true"
            onMouseDown={startDragging}
            onDoubleClick={() =>
              run(desktopWindow?.toggleMaximize?.bind(desktopWindow))
            }
          />
          <div
            className="window-controls window-controls--tauri"
            role="group"
            aria-label="Window controls"
          >
            <button
              type="button"
              aria-label="Minimize window"
              onClick={() => run(desktopWindow?.minimize?.bind(desktopWindow))}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              aria-label={maximized ? "Restore window" : "Maximize window"}
              onClick={() =>
                run(desktopWindow?.toggleMaximize?.bind(desktopWindow))
              }
            >
              {maximized ? <Copy size={13} /> : <Square size={13} />}
            </button>
            <button
              className="window-controls__close"
              type="button"
              aria-label="Close window"
              onClick={() => run(desktopWindow?.close?.bind(desktopWindow))}
            >
              <X size={16} />
            </button>
          </div>
        </>
      ) : null}
      <div
        className="window-titlebar"
        data-platform={runtimePlatform}
        data-shell={showSpaceSwitcher ? "true" : "false"}
        data-sidebar-visible={
          showSpaceSwitcher ? String(sidebarVisible) : undefined
        }
      >
        <span className="window-titlebar__drag" aria-hidden="true" />
      </div>
    </>
  );
}
