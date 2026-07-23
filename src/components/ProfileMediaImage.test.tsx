import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileMediaImage } from "./ProfileMediaImage";

describe("ProfileMediaImage", () => {
  it("evicts and reloads a failed cached image once", async () => {
    const loadMedia = vi.fn().mockResolvedValue("blob:fresh-cover");
    const { container } = render(
      <ProfileMediaImage
        bucket="profile-covers"
        loadMedia={loadMedia}
        path="member/cover"
        src="blob:stale-cover"
        alt=""
      />,
    );

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        "blob:fresh-cover",
      ),
    );
    expect(loadMedia).toHaveBeenCalledWith("profile-covers", "member/cover", {
      refresh: true,
    });

    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    await waitFor(() => expect(container.querySelector("img")).toBeNull());
    expect(loadMedia).toHaveBeenCalledOnce();
  });

  it("hides a failed pathless image without retrying", () => {
    const loadMedia = vi.fn();
    const { container } = render(
      <ProfileMediaImage
        bucket="profile-covers"
        loadMedia={loadMedia}
        path={null}
        src="https://example.invalid/legacy-cover"
        alt=""
      />,
    );

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(loadMedia).not.toHaveBeenCalled();
  });
});
