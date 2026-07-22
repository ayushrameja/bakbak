import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AVATAR_BUCKET, COVER_BUCKET } from "../../lib/profile-service";
import type { ServerMember } from "../../lib/types";
import { DirectPersonPanel } from "./DirectPersonPanel";

const member: ServerMember = {
  id: "friend-1",
  displayName: "Mira",
  email: "mira@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: "friend/avatar.webp",
  avatarAnimationPath: "friend/avatar.gif",
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: "friend/cover.webp",
  coverAnimationPath: "friend/cover.gif",
  coverPositionX: 62,
  coverPositionY: 31,
  description: "Professional yapper.",
  status: "online",
  role: "member",
};

describe("DirectPersonPanel", () => {
  it("plays the selected person's animated avatar and cover", async () => {
    const urls = new Map([
      [`${AVATAR_BUCKET}:${member.avatarPath}`, "blob:avatar-poster"],
      [
        `${AVATAR_BUCKET}:${member.avatarAnimationPath}`,
        "blob:avatar-animation",
      ],
      [`${COVER_BUCKET}:${member.coverPath}`, "blob:cover-poster"],
      [`${COVER_BUCKET}:${member.coverAnimationPath}`, "blob:cover-animation"],
    ]);
    const loadProfileMedia = vi.fn((bucket: string, path: string | null) =>
      Promise.resolve(urls.get(`${bucket}:${path}`) ?? null),
    );
    const { container } = render(
      <DirectPersonPanel
        member={member}
        loadProfileMedia={loadProfileMedia}
        sharesServer
      />,
    );

    await waitFor(() =>
      expect(
        container.querySelector(".direct-person-panel__cover-animation"),
      ).toHaveAttribute("src", "blob:cover-animation"),
    );
    expect(
      container.querySelector(".direct-person-panel__cover-poster"),
    ).toHaveStyle({ objectPosition: "62% 31%" });
    expect(container.querySelector(".avatar__animation")).toHaveAttribute(
      "src",
      "blob:avatar-animation",
    );
    expect(container.querySelector(".avatar__animation")).toHaveClass(
      "is-visible",
    );
  });
});
