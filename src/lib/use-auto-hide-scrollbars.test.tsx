import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCROLLBAR_IDLE_DELAY_MS,
  useAutoHideScrollbars,
} from "./use-auto-hide-scrollbars";

function ScrollHarness() {
  useAutoHideScrollbars();
  return <div data-testid="scroll-surface" />;
}

describe("useAutoHideScrollbars", () => {
  afterEach(() => vi.useRealTimers());

  it("reveals a scrolling surface and hides it after the idle timeout", () => {
    vi.useFakeTimers();
    const { getByTestId, unmount } = render(<ScrollHarness />);
    const surface = getByTestId("scroll-surface");

    fireEvent.scroll(surface);
    expect(surface).toHaveClass("is-scrolling");
    void act(() => vi.advanceTimersByTime(SCROLLBAR_IDLE_DELAY_MS - 1));
    expect(surface).toHaveClass("is-scrolling");
    void act(() => vi.advanceTimersByTime(1));
    expect(surface).not.toHaveClass("is-scrolling");

    fireEvent.scroll(surface);
    unmount();
    expect(surface).not.toHaveClass("is-scrolling");
  });
});
