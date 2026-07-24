import type { KeyboardEvent, PointerEvent } from "react";

interface PanelResizerProps {
  label: string;
  side: "left" | "right";
  enabled?: boolean;
  value: number;
  minimum: number;
  maximum: number;
  defaultValue: number;
  onChange: (value: number) => void;
}

export function PanelResizer({
  label,
  side,
  enabled = true,
  value,
  minimum,
  maximum,
  defaultValue,
  onChange,
}: PanelResizerProps) {
  function apply(value: number) {
    onChange(Math.max(minimum, Math.min(maximum, Math.round(value))));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled) return;
    event.preventDefault();
    const startX = event.clientX;
    const startValue = value;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    target.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    document.documentElement.classList.add("is-panel-resizing");
    let finished = false;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      apply(startValue + (side === "left" ? delta : -delta));
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      document.documentElement.classList.remove("is-panel-resizing");
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onEnd);
      target.removeEventListener("pointercancel", onEnd);
      target.removeEventListener("lostpointercapture", finish);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("blur", finish);
    };
    const onEnd = (endEvent: globalThis.PointerEvent) => {
      if (target.hasPointerCapture(endEvent.pointerId)) {
        target.releasePointerCapture(endEvent.pointerId);
      }
      finish();
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onEnd);
    target.addEventListener("pointercancel", onEnd);
    target.addEventListener("lostpointercapture", finish);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("blur", finish);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!enabled) return;
    const step = event.shiftKey ? 24 : 8;
    const direction = side === "left" ? 1 : -1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      apply(value - step * direction);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      apply(value + step * direction);
    } else if (event.key === "Home") {
      event.preventDefault();
      apply(minimum);
    } else if (event.key === "End") {
      event.preventDefault();
      apply(maximum);
    }
  }

  return (
    <div
      className={`panel-resizer panel-resizer--${side}`}
      data-enabled={enabled ? "true" : "false"}
      role={enabled ? "separator" : undefined}
      tabIndex={enabled ? 0 : -1}
      aria-hidden={enabled ? undefined : true}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={value}
      onDoubleClick={() => {
        if (enabled) apply(defaultValue);
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    />
  );
}
