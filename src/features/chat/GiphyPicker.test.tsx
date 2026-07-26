import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GiphyPicker } from "./GiphyPicker";

const giphyState = vi.hoisted(() => ({
  configured: true,
  register: vi.fn(),
  search: vi.fn(),
  RateLimitError: class GiphyRateLimitError extends Error {
    constructor() {
      super("GIPHY is taking a breather. Try again in a little while.");
    }
  },
}));

vi.mock("../../lib/giphy-service", () => ({
  GiphyRateLimitError: giphyState.RateLimitError,
  isGiphyConfigured: () => giphyState.configured,
  registerGiphyAction: giphyState.register,
  searchGiphy: giphyState.search,
}));

describe("GiphyPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    giphyState.configured = true;
    giphyState.search.mockResolvedValue({ assets: [], nextOffset: null });
  });

  it("keeps the profile picker GIF-only and visibly attributed", () => {
    render(
      <GiphyPicker
        fixedKind="gif"
        target="avatar"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "GIPHY avatar picker" }),
    ).toBeVisible();
    expect(screen.getByText("Choose an avatar GIF")).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Stickers" })).toBeNull();
    expect(screen.getByText("Powered by GIPHY")).toBeVisible();
  });

  it("handles a missing key and retryable rate limit without losing the picker", async () => {
    giphyState.configured = false;
    const { rerender } = render(
      <GiphyPicker onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/Add the public GIPHY key/)).toBeVisible();
    expect(giphyState.search).not.toHaveBeenCalled();

    giphyState.configured = true;
    giphyState.search.mockRejectedValueOnce(new giphyState.RateLimitError());
    rerender(
      <GiphyPicker key="configured" onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(await screen.findByText(/GIPHY is taking a breather/)).toBeVisible();

    giphyState.search.mockResolvedValueOnce({
      assets: [],
      nextOffset: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(giphyState.search).toHaveBeenCalledTimes(2);
  });
});
