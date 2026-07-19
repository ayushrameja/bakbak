import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PanelResizer } from "./PanelResizer";

describe("PanelResizer", () => {
  it("supports arrows, shifted steps, bounds, and reset", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PanelResizer
        label="Resize navigation panel"
        side="left"
        value={232}
        minimum={200}
        maximum={360}
        defaultValue={232}
        onChange={onChange}
      />,
    );
    const separator = screen.getByRole("separator", {
      name: "Resize navigation panel",
    });

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(240);
    fireEvent.keyDown(separator, { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(208);
    fireEvent.keyDown(separator, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(200);
    fireEvent.keyDown(separator, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(360);

    rerender(
      <PanelResizer
        label="Resize navigation panel"
        side="left"
        value={310}
        minimum={200}
        maximum={330}
        defaultValue={232}
        onChange={onChange}
      />,
    );
    fireEvent.doubleClick(separator);
    expect(onChange).toHaveBeenLastCalledWith(232);
  });

  it("reverses horizontal movement for a right-side panel", () => {
    const onChange = vi.fn();
    render(
      <PanelResizer
        label="Resize details panel"
        side="right"
        value={240}
        minimum={200}
        maximum={360}
        defaultValue={240}
        onChange={onChange}
      />,
    );
    const separator = screen.getByRole("separator", {
      name: "Resize details panel",
    });
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(248);
  });
});
