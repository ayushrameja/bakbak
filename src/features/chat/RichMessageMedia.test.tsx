import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMessage, Sticker } from "../../lib/types";
import { RichMessageMedia } from "./RichMessageMedia";

const message: ConversationMessage = {
  id: "message-1",
  authorId: "user-1",
  body: "[Sticker]",
  content: [],
  createdAt: "2026-07-23T10:00:00.000Z",
  presentation: { kind: "sticker", stickerId: "sticker-1" },
};

const sticker: Sticker = {
  id: "sticker-1",
  serverId: "server-1",
  label: "Wave",
  posterPath: "wave.webp",
  animationPath: "wave.gif",
  width: 128,
  height: 128,
  createdBy: "user-1",
  enabled: true,
  createdAt: "2026-07-23T10:00:00.000Z",
  posterUrl: "blob:poster",
  animationUrl: "blob:animation",
};

describe("RichMessageMedia reduced motion", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("renders the static custom-sticker poster instead of its GIF", () => {
    render(
      <RichMessageMedia
        message={message}
        stickersById={new Map([[sticker.id, sticker]])}
      />,
    );
    expect(screen.getByRole("img", { name: "Wave" })).toHaveAttribute(
      "src",
      sticker.posterUrl,
    );
  });
});
