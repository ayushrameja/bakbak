import { useEffect } from "react";
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
  const runtimePlatform = platform ?? getDesktopBridge()?.platform ?? "web";

  useEffect(() => {
    const desktopWindow = getDesktopBridge()?.window;
    if (runtimePlatform !== "macos") return;
    if (!desktopWindow?.setWindowControlsVisible) return;
    const visible = !showSpaceSwitcher || sidebarVisible;
    void desktopWindow
      .setWindowControlsVisible(visible, sidebarPosition)
      .catch(() => undefined);
  }, [runtimePlatform, showSpaceSwitcher, sidebarPosition, sidebarVisible]);

  useEffect(
    () => () => {
      void getDesktopBridge()
        ?.window.setWindowControlsVisible?.(true, "left")
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
