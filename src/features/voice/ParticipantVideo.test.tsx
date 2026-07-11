import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParticipantVideo } from "./ParticipantVideo";

describe("ParticipantVideo", () => {
  it("attaches and detaches the LiveKit track", () => {
    const track = { attach: vi.fn(), detach: vi.fn() };
    const { unmount } = render(
      <ParticipantVideo track={track} local label="Ayu" />,
    );
    expect(track.attach).toHaveBeenCalledWith(expect.any(HTMLVideoElement));
    unmount();
    expect(track.detach).toHaveBeenCalledWith(expect.any(HTMLVideoElement));
  });
});
