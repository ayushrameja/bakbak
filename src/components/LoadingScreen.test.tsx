import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("renders one accessible Bakbak status with six staggered letters", () => {
    const { container } = render(<LoadingScreen />);

    expect(
      screen.getByRole("status", { name: "Loading Bakbak" }),
    ).toBeVisible();
    const word = container.querySelector(".app-loading__word");
    expect(word).toHaveTextContent("BAKBAK");
    expect(word?.querySelectorAll("span")).toHaveLength(6);
    expect(word?.querySelector("span")).toHaveStyle("--letter-index: 0");
    expect(screen.queryByText("Opening Bakbak")).not.toBeInTheDocument();
    expect(container.querySelector(".bakbak-mark")).toBeNull();
  });
});
