import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DestinationRail } from "./DestinationRail";

describe("DestinationRail", () => {
  it("switches destinations and exposes unread and call state", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <DestinationRail
        activeSpace="personal"
        personalUnread
        serverUnread
        callActive
        serverAvailable
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("button", { name: "Personal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      container.querySelectorAll(".destination-rail__unread"),
    ).toHaveLength(2);
    expect(container.querySelector(".destination-rail__call")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Bakbak server" }),
    );
    expect(onSelect).toHaveBeenCalledWith("server");
  });

  it("keeps the server destination disabled without membership", () => {
    render(
      <DestinationRail
        activeSpace="personal"
        personalUnread={false}
        serverUnread={false}
        callActive={false}
        serverAvailable={false}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Server invite needed" }),
    ).toBeDisabled();
  });
});
