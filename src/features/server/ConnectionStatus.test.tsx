import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStatus } from "./ConnectionStatus";

describe("ConnectionStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the deployed backend region and measured API latency", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    render(
      <ConnectionStatus
        mode="live"
        backendUrl="https://bakbak.example"
        backendRegion="Canada Central (ca-central-1)"
        voiceConnected={false}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: /connection status: \d+ ms/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Canada Central (ca-central-1)")).toBeVisible();
    expect(screen.getByText("India West")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "https://bakbak.example/auth/v1/health",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("labels mock mode without making a network request", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(
      <ConnectionStatus
        mode="mock"
        backendUrl=""
        backendRegion="Canada Central (ca-central-1)"
        voiceConnected={false}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Connection status: Local" }),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
});
