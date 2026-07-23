import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BakbakMotionMark } from "./BakbakMotionMark";

describe("BakbakMotionMark", () => {
  it("renders one two-part jaw and three conversation dots decoratively", () => {
    const { container } = render(
      <BakbakMotionMark className="test-brand-mark" />,
    );

    const mark = container.querySelector(".bakbak-motion-mark");
    expect(mark).toHaveClass("test-brand-mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark?.querySelectorAll(".bakbak-motion-mark__jaw")).toHaveLength(2);
    expect(mark?.querySelectorAll(".bakbak-motion-mark__dot")).toHaveLength(3);
  });
});
