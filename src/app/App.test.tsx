import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { interfaceSoundController } from "../features/settings/interface-sounds";
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
    expect(
      document.querySelector(".window-titlebar__center"),
    ).toBeEmptyDOMElement();
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

  it("keeps the text-channel topic in the intro instead of the top bar", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );

    expect(screen.getByRole("heading", { name: "#Chat" })).toBeVisible();
    expect(
      screen.getByText("A private conversation for server members."),
    ).toBeVisible();
    expect(
      document.querySelector(".top-bar .top-bar__channel span"),
    ).toBeNull();

    const topBar = document.querySelector<HTMLElement>(".top-bar")!;
    expect(topBar).toHaveAttribute("data-context", "channel");
    expect(
      within(topBar).getByText("Chat", { selector: "strong" }),
    ).toBeVisible();
    expect(
      within(topBar).queryByRole("button", { name: "Show 4 members" }),
    ).toBeNull();
    expect(
      within(topBar).queryByRole("button", { name: "Open audio settings" }),
    ).toBeNull();
    await userEvent.click(
      within(topBar).getByRole("button", { name: "More channel actions" }),
    );
    expect(screen.getByRole("menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(
      within(topBar).getByRole("button", { name: "More channel actions" }),
    ).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(
      within(topBar).getByRole("button", { name: "More channel actions" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Show members" }),
    );
    expect(screen.getByRole("dialog", { name: "Members" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Members" })).toBeNull();
  });

  it("preserves each channel draft while visiting settings and other rooms", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );

    const spawnDraft = await screen.findByRole("combobox", {
      name: "Message #Chat",
    });
    await userEvent.type(spawnDraft, "tea-fuelled thought");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
    await userEvent.click(
      screen.getByRole("button", { name: "Close settings" }),
    );
    expect(
      await screen.findByRole("combobox", { name: "Message #Chat" }),
    ).toHaveValue("tea-fuelled thought");

    await userEvent.click(screen.getByRole("button", { name: "Volt" }));
    const clipsDraft = await screen.findByRole("combobox", {
      name: "Message #Volt",
    });
    await userEvent.type(clipsDraft, "second room, same brain");
    await userEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(
      await screen.findByRole("combobox", { name: "Message #Chat" }),
    ).toHaveValue("tea-fuelled thought");
  });

  it("shows, hides, and persists the single unified sidebar", async () => {
    const first = render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );

    const shell = document.querySelector(".desktop-shell");
    expect(shell).toHaveAttribute("data-left-panel", "visible");
    expect(shell).not.toHaveAttribute("data-right-panel");
    expect(document.querySelector(".panel-slot--right")).toBeNull();
    expect(document.querySelector(".panel-resizer--right")).toBeNull();
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

    first.unmount();
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );
    expect(
      screen.getByRole("button", { name: "Show channel panel" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /member panel/i })).toBeNull();
  });

  it("does not expose text chat inside voice channels", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Game #1" }));

    const callRegion = await screen.findByRole("region", {
      name: "Current voice call",
    });
    expect(callRegion).toHaveTextContent("Game #1");
    expect(
      screen.queryByRole("button", { name: "Join voice" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Joining quietly…")).not.toBeInTheDocument();
    expect(
      await within(screen.getByRole("main")).findByText("Ayush"),
    ).toBeVisible();
    expect(screen.queryByText("Ayush (you)")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Message #Game #1" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).queryByRole("button", {
        name: /chat/i,
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Game #2" }));
    expect(callRegion).toHaveTextContent("Game #2");
    expect(callRegion).toHaveTextContent("Connecting");
    await waitFor(() =>
      expect(callRegion).toHaveTextContent("Voice connected"),
    );
    expect(screen.queryByText(/chaos connected/i)).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "User controls" })).toBeVisible();
  });

  it("switches Personal and Bakbak without interrupting the active call", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Game #1" }));
    const callRegion = await screen.findByRole("region", {
      name: "Current voice call",
    });
    await waitFor(() =>
      expect(callRegion).toHaveTextContent("Voice connected"),
    );

    await userEvent.click(screen.getByRole("button", { name: "Personal" }));
    expect(document.querySelector(".desktop-shell")).toHaveAttribute(
      "data-space-direction",
      "left",
    );
    expect(
      screen.getByRole("heading", { name: "Your conversations live here" }),
    ).toBeVisible();
    expect(callRegion).toHaveTextContent("Game #1");
    expect(screen.getByRole("group", { name: "User controls" })).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Bakbak server" }),
    );
    expect(callRegion).toHaveTextContent("Game #1");
    expect(
      screen.getByRole("button", { name: "Bakbak server" }),
    ).toHaveAttribute("aria-current", "page");
    expect(document.querySelector(".desktop-shell")).toHaveAttribute(
      "data-space-direction",
      "right",
    );
  });

  it("creates and sends a mock DM without a read-state render loop", async () => {
    const interfaceSound = vi.spyOn(interfaceSoundController, "play");
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
      expect(
        interfaceSound.mock.calls.filter(
          ([event]) => event.type === "message-sent",
        ),
      ).toHaveLength(1);
    } finally {
      interfaceSound.mockRestore();
      consoleError.mockRestore();
    }
  });

  it("plays the outgoing cue once after a mock channel message commits", async () => {
    const interfaceSound = vi.spyOn(interfaceSoundController, "play");
    try {
      render(<App />);
      await userEvent.click(
        screen.getByRole("button", { name: "Enter the preview" }),
      );
      const composer = await screen.findByRole("combobox", {
        name: "Message #Chat",
      });
      await userEvent.type(composer, "Soft plucks, loud opinions.");
      await userEvent.click(
        screen.getByRole("button", { name: "Send message" }),
      );

      expect(
        await screen.findByText("Soft plucks, loud opinions."),
      ).toBeVisible();
      await waitFor(() =>
        expect(
          interfaceSound.mock.calls.filter(
            ([event]) => event.type === "message-sent",
          ),
        ).toHaveLength(1),
      );
    } finally {
      interfaceSound.mockRestore();
    }
  });

  it("does not play the outgoing cue when a channel message fails", async () => {
    const interfaceSound = vi.spyOn(interfaceSoundController, "play");
    let timeoutSpy: { mockRestore(): void } | null = null;
    try {
      render(<App />);
      await userEvent.click(
        screen.getByRole("button", { name: "Enter the preview" }),
      );
      const composer = await screen.findByRole("combobox", {
        name: "Message #Chat",
      });
      await userEvent.type(composer, "This one should bounce.");
      const realSetTimeout = window.setTimeout.bind(window);
      timeoutSpy = vi
        .spyOn(window, "setTimeout")
        .mockImplementation((handler, timeout) => {
          if (timeout === 240) throw new Error("mock send failed");
          return realSetTimeout(handler, timeout);
        });
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));

      expect(await screen.findByText("mock send failed")).toBeVisible();
      expect(
        interfaceSound.mock.calls.filter(
          ([event]) => event.type === "message-sent",
        ),
      ).toHaveLength(0);
    } finally {
      timeoutSpy?.mockRestore();
      interfaceSound.mockRestore();
    }
  });

  it("opens one private profile card from the sidebar member preview", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "Enter the preview" }),
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "View Mira's profile",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Mira" }),
    ).toHaveTextContent("Makes things");
    expect(screen.queryByText("mira@bakbak.local")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", {
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
