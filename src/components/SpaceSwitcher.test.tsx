import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SpaceSwitcher } from "./SpaceSwitcher";

describe("SpaceSwitcher", () => {
  it("switches spaces and exposes unread and call state", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SpaceSwitcher
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
    expect(container.querySelectorAll(".space-switcher__unread")).toHaveLength(
      2,
    );
    expect(container.querySelector(".space-switcher__call")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Bakbak server" }),
    );
    expect(onSelect).toHaveBeenCalledWith("server");
  });

  it("supports arrow, Home, and End navigation", async () => {
    const onSelect = vi.fn();
    render(
      <SpaceSwitcher
        activeSpace="personal"
        personalUnread={false}
        serverUnread={false}
        callActive={false}
        serverAvailable
        onSelect={onSelect}
      />,
    );

    const personal = screen.getByRole("button", { name: "Personal" });
    personal.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onSelect).toHaveBeenLastCalledWith("server");
    expect(screen.getByRole("button", { name: "Bakbak server" })).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(onSelect).toHaveBeenLastCalledWith("personal");
    expect(personal).toHaveFocus();

    await userEvent.keyboard("{End}");
    expect(onSelect).toHaveBeenLastCalledWith("server");
  });

  it("keeps an unavailable server disabled and can lock both spaces", () => {
    const { rerender } = render(
      <SpaceSwitcher
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

    rerender(
      <SpaceSwitcher
        activeSpace="personal"
        personalUnread={false}
        serverUnread={false}
        callActive={false}
        serverAvailable
        disabled
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Personal" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Bakbak server" }),
    ).toBeDisabled();
  });
});
