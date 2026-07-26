import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("falls back to initials when a resolved provider poster stops loading", () => {
    const { container } = render(
      <Avatar
        user={{
          displayName: "Mira Rai",
          avatarUrl: "https://media.giphy.com/missing.webp",
          status: "online",
        }}
      />,
    );

    const poster = container.querySelector(".avatar__poster");
    expect(poster).not.toBeNull();
    fireEvent.error(poster!);
    expect(screen.getByText("MR")).toBeVisible();
  });
});
