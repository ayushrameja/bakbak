import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("renders one accessible app-shaped Bakbak loading status", () => {
    const { container } = render(<LoadingScreen />);

    expect(
      screen.getByRole("status", { name: "Loading Bakbak" }),
    ).toBeVisible();
    expect(container.querySelector(".app-loading__sidebar")).not.toBeNull();
    expect(container.querySelector(".app-loading__canvas")).not.toBeNull();
    expect(container.querySelector(".app-loading__status")).toHaveTextContent(
      "Opening Bakbak",
    );
    expect(container.querySelectorAll(".bakbak-mark")).toHaveLength(2);
  });
});
