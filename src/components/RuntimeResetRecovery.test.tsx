import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RuntimeResetRecovery } from "./RuntimeResetRecovery";

describe("RuntimeResetRecovery", () => {
  it("explains the local-only cleanup and offers a retry", () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    render(<RuntimeResetRecovery onRetry={retry} />);

    expect(
      screen.getByRole("heading", {
        name: "Bakbak could not finish local cleanup",
      }),
    ).toBeVisible();
    expect(screen.getByText(/cloud messages.*stay safe/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
