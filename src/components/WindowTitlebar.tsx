import {
  Copy,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { AppSpace } from "../features/server/app-space";
import type { VoiceConnectionStatus } from "../features/voice/useVoiceRoom";
import {
  createWindowChromeAdapter,
  type WindowChromeAdapter,
} from "../lib/window-chrome";
import { SpaceSwitcher } from "./SpaceSwitcher";

interface WindowTitlebarProps {
  showSpaceSwitcher: boolean;
  activeSpace: AppSpace;
  personalUnread: boolean;
  serverUnread: boolean;
  callActive: boolean;
  callStatus?: VoiceConnectionStatus;
  callChannelName?: string | null;
  serverAvailable: boolean;
  switchDisabled: boolean;
  onSelectSpace: (space: AppSpace) => void;
  panelControls?: {
    leftPanelVisible: boolean;
    rightPanelVisible: boolean;
    disabled: boolean;
    onToggleLeftPanel: () => void;
    onToggleRightPanel: () => void;
  };
  chromeAdapter?: WindowChromeAdapter;
}

export function WindowTitlebar({
  showSpaceSwitcher,
  activeSpace,
  personalUnread,
  serverUnread,
  callActive,
  callStatus,
  callChannelName,
  serverAvailable,
  switchDisabled,
  onSelectSpace,
  panelControls,
  chromeAdapter,
}: WindowTitlebarProps) {
  const adapter = useMemo(
    () => chromeAdapter ?? createWindowChromeAdapter(),
    [chromeAdapter],
  );
  const [maximized, setMaximized] = useState(false);
  const titleStatus = callStatus ?? (callActive ? "connected" : "disconnected");
  const titleMessages = useMemo(
    () => getTitlebarMessages(titleStatus, callChannelName),
    [callChannelName, titleStatus],
  );
  const [titleIndex, setTitleIndex] = useState(0);

  useEffect(() => {
    setTitleIndex(0);
    if (!showSpaceSwitcher || titleMessages.length < 2) return;
    const interval = window.setInterval(() => {
      setTitleIndex((current) => (current + 1) % titleMessages.length);
    }, TITLEBAR_MESSAGE_ROTATION_MS);
    return () => window.clearInterval(interval);
  }, [showSpaceSwitcher, titleMessages]);

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
        {showSpaceSwitcher ? (
          <SpaceSwitcher
            activeSpace={activeSpace}
            personalUnread={personalUnread}
            serverUnread={serverUnread}
            callActive={callActive}
            serverAvailable={serverAvailable}
            disabled={switchDisabled}
            onSelect={onSelectSpace}
          />
        ) : null}
        <span className="window-titlebar__drag window-titlebar__drag--leading" />
      </div>
      <div
        className="window-titlebar__center window-titlebar__drag"
        data-title-state={titleStatus}
      >
        {showSpaceSwitcher ? (
          <strong key={titleMessages[titleIndex]}>
            {titleMessages[titleIndex]}
          </strong>
        ) : null}
      </div>
      <div className="window-titlebar__trailing">
        <span className="window-titlebar__drag window-titlebar__drag--trailing" />
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
            <button
              type="button"
              aria-label={
                panelControls.rightPanelVisible
                  ? "Hide member panel"
                  : "Show member panel"
              }
              aria-controls="member-panel"
              aria-expanded={panelControls.rightPanelVisible}
              disabled={panelControls.disabled}
              onClick={panelControls.onToggleRightPanel}
            >
              {panelControls.rightPanelVisible ? (
                <PanelRightClose size={18} />
              ) : (
                <PanelRightOpen size={18} />
              )}
            </button>
          </div>
        ) : null}
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

export const TITLEBAR_MESSAGE_ROTATION_MS = 8_000;

function getTitlebarMessages(
  status: VoiceConnectionStatus,
  channelName?: string | null,
): string[] {
  const room = channelName?.trim() || "Voice";
  if (status === "connecting") {
    return [`Calling ${room}…`, "Warming up the yap engine…"];
  }
  if (status === "reconnecting") {
    return ["Reconnecting the gossip…", "Wi-Fi is doing parkour…"];
  }
  if (status === "connected") {
    return [
      `${room}: chaos connected`,
      "Mic on, wisdom off",
      "Live from the yap factory",
      "Zero agenda, full volume",
    ];
  }
  if (status === "error") {
    return ["Voice gremlins won this round", "Retry before dignity returns"];
  }
  return [
    "OG Nahan Gang",
    "Professional yappers",
    "No agenda, only vibes",
    "Gossip loading responsibly",
  ];
}
