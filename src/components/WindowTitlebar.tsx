import { PanelLeftClose } from "lucide-react";
import { useEffect } from "react";
import { getDesktopBridge } from "../lib/desktop-runtime";

interface WindowTitlebarProps {
  showSpaceSwitcher: boolean;
  panelControls?: {
    sidebarVisible: boolean;
    disabled: boolean;
    onToggleSidebar: () => void;
  };
  platform?: "macos" | "windows" | "web";
}

export function WindowTitlebar({
  showSpaceSwitcher,
  panelControls,
  platform,
}: WindowTitlebarProps) {
  const runtimePlatform = platform ?? getDesktopBridge()?.platform ?? "web";
  const sidebarVisible = panelControls?.sidebarVisible ?? false;

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
          showSpaceSwitcher && panelControls
            ? String(sidebarVisible)
            : undefined
        }
      >
        <span className="window-titlebar__drag" aria-hidden="true" />
        {panelControls?.sidebarVisible ? (
          <div
            className="titlebar-panel-controls"
            role="group"
            aria-label="Sidebar controls"
          >
            <button
              type="button"
              aria-label="Hide sidebar"
              aria-controls="context-panel"
              aria-expanded="true"
              aria-keyshortcuts="Meta+B Control+B"
              title="Hide sidebar (Cmd/Ctrl+B)"
              disabled={panelControls.disabled}
              onClick={panelControls.onToggleSidebar}
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
