import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BakbakMark } from "./BakbakMark";

describe("BakbakMark", () => {
  it("renders a decorative two-letter Bakbak monogram", () => {
    const { container } = render(<BakbakMark className="test-brand-mark" />);

    const mark = container.querySelector(".bakbak-mark");
    expect(mark).toHaveClass("test-brand-mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark?.querySelectorAll(".bakbak-mark__glyph")).toHaveLength(2);
    expect(mark?.querySelector(".bakbak-mark__glyph--first")).toBeVisible();
    expect(mark?.querySelector(".bakbak-mark__glyph--second")).toBeVisible();
  });
});
