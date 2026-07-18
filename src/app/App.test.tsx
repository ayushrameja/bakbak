import { render, screen, waitFor, within } from "@testing-library/react";
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

    const spawnDraft = await screen.findByRole("combobox", {
      name: "Message #spawn",
    });
    await userEvent.type(spawnDraft, "tea-fuelled thought");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
    await userEvent.click(
      screen.getByRole("button", { name: "Close settings" }),
    );
    expect(
      await screen.findByRole("combobox", { name: "Message #spawn" }),
    ).toHaveValue("tea-fuelled thought");

    await userEvent.click(screen.getByRole("button", { name: "clips" }));
    const clipsDraft = await screen.findByRole("combobox", {
      name: "Message #clips",
    });
    await userEvent.type(clipsDraft, "second room, same brain");
    await userEvent.click(screen.getByRole("button", { name: "spawn" }));
    expect(
      await screen.findByRole("combobox", { name: "Message #spawn" }),
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
    await userEvent.click(screen.getByRole("button", { name: "Queue" }));

    const callRegion = await screen.findByRole("region", {
      name: "Current voice call",
    });
    expect(callRegion).toHaveTextContent("Queue");
    expect(
      screen.queryByRole("button", { name: "Join voice" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Joining quietly…")).not.toBeInTheDocument();
    expect(await screen.findByText("Ayush (you)")).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Message #Queue" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /chat/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Crash" }));
    expect(callRegion).toHaveTextContent("Crash");
    expect(callRegion).toHaveTextContent("Connecting");
    await waitFor(() =>
      expect(callRegion).toHaveTextContent("Voice connected"),
    );
  });

  it("opens one private profile card from the member panel", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );

    const memberPanel = screen.getByRole("complementary", { name: "Members" });
    await userEvent.click(
      within(memberPanel).getByRole("button", {
        name: "View Mira's profile",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Mira" }),
    ).toHaveTextContent("Makes things");
    expect(screen.queryByText("mira@bakbak.local")).not.toBeInTheDocument();

    await userEvent.click(
      within(memberPanel).getByRole("button", {
        name: "View Jo's profile",
      }),
    );
    expect(await screen.findByRole("dialog", { name: "Jo" })).toHaveTextContent(
      "suspiciously specific",
    );
    expect(
      screen.queryByRole("dialog", { name: "Mira" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Close profile" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Jo" }),
    ).not.toBeInTheDocument();
  });
});
