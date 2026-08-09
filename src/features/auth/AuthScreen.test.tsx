import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthScreen } from "./AuthScreen";

describe("AuthScreen", () => {
  it("switches between sign-in and invite access without losing form semantics", async () => {
    const user = userEvent.setup();
    render(
      <AuthScreen
        mode="live"
        configurationWarning={null}
        onAuthenticated={vi.fn()}
        onEnterMock={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("tab", { name: "Use an invite" }));
    expect(screen.getByRole("heading", { name: "Join Bakbak" })).toBeVisible();
    expect(screen.getByLabelText("Display name")).toBeRequired();
    expect(screen.getByLabelText("Invite code")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByRole("tab", { name: "Use an invite" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps preview entry local and credential-free", async () => {
    const onEnterMock = vi.fn();
    const user = userEvent.setup();
    render(
      <AuthScreen
        mode="mock"
        configurationWarning={null}
        onAuthenticated={vi.fn()}
        onEnterMock={onEnterMock}
      />,
    );

    expect(screen.queryByLabelText("Email address")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Enter the preview" }));
    expect(onEnterMock).toHaveBeenCalledOnce();
  });
});
