import {
  Copy,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  createWindowChromeAdapter,
  type WindowChromeAdapter,
} from "../lib/window-chrome";

interface WindowTitlebarProps {
  showSpaceSwitcher: boolean;
  panelControls?: {
    leftPanelVisible: boolean;
    disabled: boolean;
    onToggleLeftPanel: () => void;
  };
  chromeAdapter?: WindowChromeAdapter;
}

export function WindowTitlebar({
  showSpaceSwitcher,
  panelControls,
  chromeAdapter,
}: WindowTitlebarProps) {
  const adapter = useMemo(
    () => chromeAdapter ?? createWindowChromeAdapter(),
    [chromeAdapter],
  );
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (adapter.platform !== "windows") return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void adapter
      .isMaximized()
      .then((next) => {
        if (!disposed) setMaximized(next);
      })
      .catch(() => undefined);
    void adapter
      .onMaximizedChange((next) => {
        if (!disposed) setMaximized(next);
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [adapter]);

  function run(action: () => Promise<void>) {
    void action().catch(() => undefined);
  }

  function handleDrag(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0 || isTitlebarControl(event.target)) return;
    event.preventDefault();
    run(() => adapter.startDragging());
  }

  function handleDoubleClick(event: MouseEvent<HTMLElement>) {
    if (isTitlebarControl(event.target)) return;
    if (adapter.platform !== "web") {
      run(() => adapter.toggleMaximize());
    }
  }

  return (
    <header
      className="window-titlebar"
      data-platform={adapter.platform}
      data-shell={showSpaceSwitcher ? "true" : "false"}
      onMouseDown={handleDrag}
      onDoubleClick={handleDoubleClick}
    >
      <div className="window-titlebar__leading">
        {panelControls ? (
          <div
            className="titlebar-panel-controls"
            role="group"
            aria-label="Panel controls"
          >
            <button
              type="button"
              aria-label={
                panelControls.leftPanelVisible
                  ? "Hide channel panel"
                  : "Show channel panel"
              }
              aria-controls="context-panel"
              aria-expanded={panelControls.leftPanelVisible}
              disabled={panelControls.disabled}
              onClick={panelControls.onToggleLeftPanel}
            >
              {panelControls.leftPanelVisible ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
          </div>
        ) : null}
        <span className="window-titlebar__drag window-titlebar__drag--leading" />
      </div>
      <div className="window-titlebar__center window-titlebar__drag" />
      <div className="window-titlebar__trailing">
        <span className="window-titlebar__drag window-titlebar__drag--trailing" />
        {adapter.platform === "windows" ? (
          <div
            className="window-controls"
            role="group"
            aria-label="Window controls"
          >
            <button
              type="button"
              aria-label="Minimize window"
              onClick={() => run(() => adapter.minimize())}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              aria-label={maximized ? "Restore window" : "Maximize window"}
              onClick={() => run(() => adapter.toggleMaximize())}
            >
              {maximized ? <Copy size={13} /> : <Square size={13} />}
            </button>
            <button
              className="window-controls__close"
              type="button"
              aria-label="Close window"
              onClick={() => run(() => adapter.close())}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function isTitlebarControl(target: EventTarget): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, a, input, select, textarea, [role='navigation'], [role='group']",
      ),
    )
  );
}
