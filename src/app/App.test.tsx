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

  it("shows app chrome everywhere and locks space switching behind settings", async () => {
    render(<App />);
    expect(document.querySelector(".window-titlebar")).not.toBeNull();
    expect(
      document.querySelector(".window-titlebar [aria-label='Bakbak']"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Bakbak spaces" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );
    expect(screen.getByText("OG Nahan Gang")).toBeVisible();
    expect(document.querySelector(".app-frame")).toHaveAttribute(
      "data-startup-assembly",
      expect.stringMatching(/running|complete/),
    );
    expect(
      screen.getByRole("navigation", { name: "Bakbak spaces" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Personal" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Bakbak server" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Hide channel panel" }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Close settings" }),
    );
    expect(screen.getByRole("button", { name: "Personal" })).toBeEnabled();
  });

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
    expect(
      screen
        .getByRole("button", { name: "Hide channel panel" })
        .closest(".window-titlebar"),
    ).not.toBeNull();
    expect(
      document.querySelector(".top-bar [aria-controls='context-panel']"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Hide channel panel" }),
    );
    expect(shell).toHaveAttribute("data-left-panel", "hidden");
    expect(shell).toHaveAttribute("data-right-panel", "visible");
    const leftSlot = document.querySelector(".panel-slot--left");
    const leftResizer = document.querySelector(".panel-resizer--left");
    expect(leftSlot).toHaveAttribute("data-visible", "false");
    expect(leftSlot).toHaveAttribute("aria-hidden", "true");
    expect(leftSlot).toHaveAttribute("inert");
    expect(leftSlot?.querySelector(".channel-sidebar")).not.toBeNull();
    expect(leftResizer).toHaveAttribute("data-enabled", "false");
    expect(leftResizer).toHaveAttribute("aria-hidden", "true");
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
    const rightSlot = document.querySelector(".panel-slot--right");
    const rightResizer = document.querySelector(".panel-resizer--right");
    expect(rightSlot).toHaveAttribute("data-visible", "false");
    expect(rightSlot).toHaveAttribute("aria-hidden", "true");
    expect(rightSlot).toHaveAttribute("inert");
    expect(rightSlot?.querySelector(".member-panel")).not.toBeNull();
    expect(rightResizer).toHaveAttribute("data-enabled", "false");
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
    expect(
      await within(screen.getByRole("main")).findByText("Ayush"),
    ).toBeVisible();
    expect(screen.queryByText("Ayush (you)")).not.toBeInTheDocument();
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

  it("switches Personal and Bakbak without interrupting the active call", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Queue" }));
    const callRegion = await screen.findByRole("region", {
      name: "Current voice call",
    });
    await waitFor(() =>
      expect(callRegion).toHaveTextContent("Voice connected"),
    );

    await userEvent.click(screen.getByRole("button", { name: "Personal" }));
    expect(document.querySelector(".desktop-shell")).toHaveAttribute(
      "data-space-transition",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Your conversations live here" }),
    ).toBeVisible();
    expect(callRegion).toHaveTextContent("Queue");

    await userEvent.click(
      screen.getByRole("button", { name: "Bakbak server" }),
    );
    expect(callRegion).toHaveTextContent("Queue");
    expect(
      screen.getByRole("button", { name: "Bakbak server" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("creates and sends a mock DM without a read-state render loop", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // React render-loop errors are asserted below.
    });
    try {
      render(<App />);
      await userEvent.click(
        screen.getByRole("button", { name: "Enter the preview" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Personal" }));
      await userEvent.click(
        screen.getByRole("button", { name: "New message" }),
      );
      const picker = screen.getByRole("dialog");
      await userEvent.click(
        within(picker).getByRole("button", { name: /Mira/ }),
      );
      const composer = screen.getByRole("combobox", { name: "Message Mira" });
      await userEvent.type(composer, "Tea at seven?");
      await userEvent.click(
        screen.getByRole("button", { name: "Send message" }),
      );

      expect(await screen.findAllByText("Tea at seven?")).toHaveLength(2);
      expect(
        consoleError.mock.calls.some(([message]) =>
          String(message).includes("Maximum update depth exceeded"),
        ),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
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
