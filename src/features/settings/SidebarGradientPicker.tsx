import { Minus, Plus } from "lucide-react";
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  sidebarThemeStyle,
  type SidebarThemePoint,
  type SpaceSidebarTheme,
} from "./sidebar-theme-preferences";

interface SidebarGradientPickerProps {
  label: string;
  theme: SpaceSidebarTheme;
  onChange: (theme: SpaceSidebarTheme) => void;
}

interface SidebarThemePreset {
  name: string;
  colors: [string, string, string];
}

const PRESET_POINTS: SpaceSidebarTheme["points"] = [
  { x: 22, y: 24 },
  { x: 55, y: 50 },
  { x: 80, y: 78 },
];

const SIDEBAR_THEME_PRESETS: SidebarThemePreset[] = [
  { name: "Moon", colors: ["#d8d6cf", "#aaa9a2", "#5a5962"] },
  { name: "Rose", colors: ["#d58b92", "#ad6e83", "#604966"] },
  { name: "Plum", colors: ["#8e667f", "#71536d", "#3d3852"] },
  { name: "Ember", colors: ["#dc6f62", "#d99a54", "#6f4053"] },
  { name: "Citrus", colors: ["#e2c53f", "#d68e47", "#696544"] },
  { name: "Meadow", colors: ["#96ce55", "#6ea95a", "#3d6f68"] },
  { name: "Lagoon", colors: ["#21c5bd", "#3695a1", "#425d82"] },
  { name: "Aurora", colors: ["#6e8ed8", "#665fa4", "#4a3d62"] },
];

function clampPoint(value: number): number {
  return Math.max(8, Math.min(92, Math.round(value)));
}

function colorsMatch(
  first: SpaceSidebarTheme["colors"],
  second: SpaceSidebarTheme["colors"],
): boolean {
  return first.every(
    (color, index) => color.toLowerCase() === second[index].toLowerCase(),
  );
}

export function SidebarGradientPicker({
  label,
  theme,
  onChange,
}: SidebarGradientPickerProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    index: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef<number | null>(null);

  function updatePoint(index: number, point: SidebarThemePoint) {
    const points = structuredClone(theme.points);
    points[index] = point;
    onChange({ ...theme, points });
  }

  function updatePointFromPointer(index: number, event: PointerEvent) {
    const bounds = fieldRef.current?.getBoundingClientRect();
    if (!bounds) return;
    updatePoint(index, {
      x: clampPoint(((event.clientX - bounds.left) / bounds.width) * 100),
      y: clampPoint(((event.clientY - bounds.top) / bounds.height) * 100),
    });
  }

  function handlePointerDown(index: number, event: PointerEvent<HTMLLabelElement>) {
    dragRef.current = {
      index,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(index: number, event: PointerEvent<HTMLLabelElement>) {
    const drag = dragRef.current;
    if (!drag || drag.index !== index || event.buttons !== 1) return;
    if (
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
      3
    ) {
      drag.moved = true;
    }
    if (drag.moved) updatePointFromPointer(index, event);
  }

  function handlePointerUp(index: number, event: PointerEvent<HTMLLabelElement>) {
    const drag = dragRef.current;
    if (drag?.index === index && drag.moved) suppressClickRef.current = index;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (!event.altKey || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const point = theme.points[index];
    const next = { ...point };
    if (event.key === "ArrowLeft") next.x = clampPoint(next.x - 2);
    if (event.key === "ArrowRight") next.x = clampPoint(next.x + 2);
    if (event.key === "ArrowUp") next.y = clampPoint(next.y - 2);
    if (event.key === "ArrowDown") next.y = clampPoint(next.y + 2);
    updatePoint(index, next);
  }

  function updateBrightness(amount: number) {
    onChange({
      ...theme,
      brightness: Math.max(-35, Math.min(35, theme.brightness + amount)),
    });
  }

  return (
    <div className="sidebar-gradient-picker">
      <div
        ref={fieldRef}
        className="sidebar-gradient-picker__field"
        data-theme-texture="dots"
        style={sidebarThemeStyle(theme)}
        aria-label={`${label} color field`}
      >
        {theme.colors.map((color, index) => (
          <label
            className="sidebar-gradient-picker__point"
            data-point={index + 1}
            hidden={theme.mode === "solid" && index > 0}
            style={
              {
                left: `${theme.mode === "solid" ? 50 : theme.points[index].x}%`,
                top: `${theme.mode === "solid" ? 50 : theme.points[index].y}%`,
                "--picker-color": color,
              } as CSSProperties
            }
            onPointerDown={(event) => handlePointerDown(index, event)}
            onPointerMove={(event) => handlePointerMove(index, event)}
            onPointerUp={(event) => handlePointerUp(index, event)}
            onClick={(event) => {
              if (suppressClickRef.current !== index) return;
              event.preventDefault();
              suppressClickRef.current = null;
            }}
            key={index}
          >
            <input
              type="color"
              value={color}
              aria-label={`${label} color ${index + 1}`}
              title="Click to choose a color. Drag to change its gradient position."
              onKeyDown={(event) => handlePointKeyDown(index, event)}
              onChange={(event) => {
                const colors = [...theme.colors] as [string, string, string];
                colors[index] = event.target.value;
                onChange({ ...theme, colors });
              }}
            />
          </label>
        ))}

        <div
          className="sidebar-gradient-picker__shade"
          role="group"
          aria-label="Shade shortcuts"
        >
          <button
            type="button"
            aria-label="Make sidebar darker"
            disabled={theme.brightness <= -35}
            onClick={() => updateBrightness(-5)}
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            aria-label="Make sidebar lighter"
            disabled={theme.brightness >= 35}
            onClick={() => updateBrightness(5)}
          >
            <Plus size={17} />
          </button>
        </div>
      </div>

      <span className="sidebar-gradient-picker__hint">
        Drag to blend · click to recolor
      </span>

      <div
        className="sidebar-gradient-picker__presets"
        role="group"
        aria-label="Color presets"
      >
        {SIDEBAR_THEME_PRESETS.map((preset) => (
          <button
            type="button"
            className={colorsMatch(theme.colors, preset.colors) ? "is-selected" : ""}
            aria-label={`${preset.name} preset`}
            aria-pressed={colorsMatch(theme.colors, preset.colors)}
            style={{
              background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]} 50%, ${preset.colors[2]})`,
            }}
            onClick={() =>
              onChange({
                ...theme,
                mode: "gradient",
                colors: [...preset.colors],
                points: structuredClone(PRESET_POINTS),
                brightness: 0,
              })
            }
            key={preset.name}
          />
        ))}
      </div>
    </div>
  );
}
