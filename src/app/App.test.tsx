import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("../lib/env", () => ({
  appConfig: {
    requestedMode: "mock",
    dataMode: "mock",
    supabaseUrl: "",
    supabaseAnonKey: "",
    livekitUrl: "",
    backendRegion: "Local",
    configurationWarning: null,
  },
}));

describe("App navigation state", () => {
  beforeEach(() => window.localStorage.clear());

  it("preserves each channel draft while visiting settings and other rooms", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );

    const lobbyDraft = await screen.findByRole("combobox", {
      name: "Message #lobby",
    });
    await userEvent.type(lobbyDraft, "tea-fuelled thought");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
    await userEvent.click(
      screen.getByRole("button", { name: "Close settings" }),
    );
    expect(
      await screen.findByRole("combobox", { name: "Message #lobby" }),
    ).toHaveValue("tea-fuelled thought");

    await userEvent.click(
      screen.getByRole("button", { name: "what-we-are-building" }),
    );
    const buildingDraft = await screen.findByRole("combobox", {
      name: "Message #what-we-are-building",
    });
    await userEvent.type(buildingDraft, "second room, same brain");
    await userEvent.click(screen.getByRole("button", { name: "lobby" }));
    expect(
      await screen.findByRole("combobox", { name: "Message #lobby" }),
    ).toHaveValue("tea-fuelled thought");
  });

  it("shows, hides, and persists both side panels independently", async () => {
    const first = render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );

    expect(
      screen.getByRole("complementary", { name: "Members" }),
    ).toBeVisible();
    const shell = document.querySelector(".desktop-shell");
    expect(shell).toHaveAttribute("data-left-panel", "visible");
    expect(shell).toHaveAttribute("data-right-panel", "visible");
    await userEvent.click(
      screen.getByRole("button", { name: "Hide channel panel" }),
    );
    expect(shell).toHaveAttribute("data-left-panel", "hidden");
    expect(shell).toHaveAttribute("data-right-panel", "visible");
    expect(
      screen.getByRole("button", { name: "Show channel panel" }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      screen.getByRole("button", { name: "Hide member panel" }),
    );
    expect(
      screen.getByRole("button", { name: "Show member panel" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("complementary", { name: "Members" }),
    ).not.toBeInTheDocument();
    expect(shell).toHaveAttribute("data-left-panel", "hidden");
    expect(shell).toHaveAttribute("data-right-panel", "hidden");

    await userEvent.click(
      screen.getByRole("button", { name: "Show channel panel" }),
    );
    expect(shell).toHaveAttribute("data-left-panel", "visible");
    expect(shell).toHaveAttribute("data-right-panel", "hidden");
    await userEvent.click(
      screen.getByRole("button", { name: "Hide channel panel" }),
    );

    first.unmount();
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );
    expect(
      screen.getByRole("button", { name: "Show channel panel" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Show member panel" }),
    ).toBeVisible();
  });

  it("does not expose text chat inside voice channels", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Coffee table" }));

    expect(
      screen.queryByRole("combobox", { name: "Message #Coffee table" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /chat/i }),
    ).not.toBeInTheDocument();
  });
});
