import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
});
