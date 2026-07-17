import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignalRedEffects } from "./SignalRedEffects";
import {
  nextSignalAmbientDelay,
  nextSignalStampDuration,
  SIGNAL_SAFE_STAMP_POSITIONS,
} from "./signal-red-scheduler";

describe("SignalRedEffects", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps deterministic ambient timings inside the safe bounds", () => {
    expect(nextSignalAmbientDelay(() => 0)).toBe(18_000);
    expect(nextSignalAmbientDelay(() => 0.99999)).toBeLessThanOrEqual(32_000);
    expect(nextSignalStampDuration(() => 0)).toBe(450);
    expect(nextSignalStampDuration(() => 0.99999)).toBeLessThanOrEqual(750);
    expect(SIGNAL_SAFE_STAMP_POSITIONS).toEqual([
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]);
  });

  it("shows one edge stamp on schedule and pauses it for modal surfaces", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <SignalRedEffects active paused={false} effect={null} random={() => 0} />,
    );
    expect(container.querySelector(".signal-effects__stamp")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(18_000);
    });
    expect(container.querySelector(".is-top-left")).toBeInTheDocument();
    expect(screen.getByText("TRANSMISSION MARK")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(container.querySelector(".signal-effects__stamp")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(18_000);
    });
    expect(container.querySelector(".is-top-left")).toBeInTheDocument();

    rerender(<SignalRedEffects active paused effect={null} random={() => 0} />);
    act(() => {
      vi.advanceTimersByTime(32_000);
    });
    expect(container.querySelector(".signal-effects__stamp")).toBeNull();
  });

  it("renders exact event copy without exposing an interactive surface", () => {
    const { container } = render(
      <SignalRedEffects
        active
        paused={false}
        effect={{
          event: {
            type: "voice-remote-joined",
            participantId: "mira",
            displayName: "Mira",
          },
          sequence: 3,
        }}
      />,
    );
    expect(screen.getByText("USER LINKED // Mira")).toBeInTheDocument();
    expect(container.querySelector(".signal-effects")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("suppresses random motion while preserving a static reduced-motion label", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const { container } = render(
      <SignalRedEffects
        active
        paused={false}
        effect={{
          event: { type: "message-received" },
          sequence: 7,
        }}
        random={() => 0}
      />,
    );
    expect(container.querySelector(".signal-effects")).toHaveClass(
      "is-reduced",
    );
    expect(screen.getByText("MESSAGE RECEIVED")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(32_000);
    });
    expect(container.querySelector(".signal-effects__stamp")).toBeNull();
  });
});
