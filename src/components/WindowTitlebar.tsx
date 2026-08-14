import { useEffect } from "react";
import { getDesktopBridge } from "../lib/desktop-runtime";

interface WindowTitlebarProps {
  showSpaceSwitcher: boolean;
  sidebarVisible?: boolean;
  platform?: "macos" | "windows" | "web";
}

export function WindowTitlebar({
  showSpaceSwitcher,
  sidebarVisible = false,
  platform,
}: WindowTitlebarProps) {
  const runtimePlatform = platform ?? getDesktopBridge()?.platform ?? "web";

  useEffect(() => {
    const desktopWindow = getDesktopBridge()?.window;
    if (runtimePlatform !== "macos") return;
    if (!desktopWindow?.setWindowControlsVisible) return;
    const visible = !showSpaceSwitcher || sidebarVisible;
    void desktopWindow.setWindowControlsVisible(visible).catch(() => undefined);
  }, [runtimePlatform, showSpaceSwitcher, sidebarVisible]);

  useEffect(
    () => () => {
      void getDesktopBridge()
        ?.window.setWindowControlsVisible?.(true)
        .catch(() => undefined);
    },
    [],
  );

  return (
    <>
      {runtimePlatform === "windows" ? (
        <span className="window-controls-overlay-scrim" aria-hidden="true" />
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
