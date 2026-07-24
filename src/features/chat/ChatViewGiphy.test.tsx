import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MessageDraft } from "../../lib/types";
import { ChatView } from "./ChatView";
import { EMPTY_MESSAGE_DRAFT } from "./message-content";

const giphyState = vi.hoisted(() => {
  const asset = {
    id: "gif-1",
    kind: "gif" as const,
    title: "Celebration",
    altText: "Friends celebrating",
    width: 480,
    height: 270,
    previewUrl: "https://media.giphy.com/preview.webp",
    stillUrl: "https://media.giphy.com/still.webp",
    originalUrl: "https://media.giphy.com/original.webp",
    analytics: {},
  };
  return {
    asset,
    register: vi.fn(),
    search: vi.fn().mockResolvedValue({
      assets: [asset],
      nextOffset: null,
    }),
  };
});

vi.mock("../../lib/giphy-service", () => ({
  GiphyRateLimitError: class GiphyRateLimitError extends Error {},
  isGiphyConfigured: () => true,
  registerGiphyAction: giphyState.register,
  resolveGiphyAssets: (ids: readonly string[]) =>
    Promise.resolve(
      ids.includes(giphyState.asset.id) ? [giphyState.asset] : [],
    ),
  searchGiphy: giphyState.search,
  toGiphyPresentation: () => ({
    kind: "giphy",
    assetId: giphyState.asset.id,
    assetKind: giphyState.asset.kind,
    title: giphyState.asset.title,
    altText: giphyState.asset.altText,
    width: giphyState.asset.width,
    height: giphyState.asset.height,
  }),
}));

const currentUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "online" as const,
};

describe("GIPHY composer staging", () => {
  it("adds a large-picker selection to the draft and sends it with text", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);

    function Harness() {
      const [draft, setDraft] = useState<MessageDraft>(EMPTY_MESSAGE_DRAFT);
      return (
        <ChatView
          channel={{
            id: "channel-1",
            serverId: "server-1",
            categoryId: null,
            name: "wallpapers",
            kind: "text",
            position: 0,
            topic: "",
          }}
          messages={[]}
          members={[{ ...currentUser, role: "admin" }]}
          currentUser={currentUser}
          sending={false}
          draft={draft}
          onDraftChange={setDraft}
          onSend={onSend}
        />
      );
    }

    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open GIPHY" }));
    expect(screen.getByRole("dialog", { name: "GIPHY picker" })).toHaveClass(
      "media-picker--giphy",
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Add Friends celebrating to message",
      }),
    );

    expect(
      screen.getByRole("img", { name: "Friends celebrating" }),
    ).toBeVisible();
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole("combobox"), "perfect reaction");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    const sentDraft = onSend.mock.calls[0]?.[0] as MessageDraft | undefined;
    expect(sentDraft?.text).toBe("perfect reaction");
    expect(sentDraft?.presentation).toMatchObject({
      kind: "giphy",
      assetId: giphyState.asset.id,
    });
    expect(giphyState.register).toHaveBeenCalledWith(
      giphyState.asset,
      "onsent",
    );
  });
});
