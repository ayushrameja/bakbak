import { describe, expect, it } from "vitest";
import { SoundWheelScroll } from "./sound-wheel-scroll";

const wheel = (deltaX: number, deltaY: number, timeStamp = 0) => ({
  deltaX,
  deltaY,
  timeStamp,
});

describe("sound wheel scroll input", () => {
  it("accepts Shift-remapped mouse wheels on the horizontal axis in both directions", () => {
    const scroll = new SoundWheelScroll();
    expect(scroll.step(wheel(-120, 0))).toBe(1);
    expect(scroll.step(wheel(120, 0, 20))).toBe(-1);
  });
  it("accepts small isolated wheel movements without a pixel-distance threshold", () => {
    const scroll = new SoundWheelScroll();
    expect(scroll.step(wheel(0, -1))).toBe(1);
    expect(scroll.step(wheel(0, -1, 300))).toBe(1);
    expect(scroll.step(wheel(0, 1, 600))).toBe(-1);
  });
  it("uses the dominant axis without adding diagonal noise", () => {
    const scroll = new SoundWheelScroll();
    expect(scroll.step(wheel(-30, 1))).toBe(1);
    expect(scroll.step(wheel(1, -30, 200))).toBe(1);
  });
  it("bounds momentum, immediately reverses, and resets on the next opening", () => {
    const scroll = new SoundWheelScroll();
    expect(scroll.step(wheel(0, -80))).toBe(1);
    expect(scroll.step(wheel(0, -80, 30))).toBe(0);
    expect(scroll.step(wheel(0, -80, 180))).toBe(1);
    expect(scroll.step(wheel(0, 80, 190))).toBe(-1);
    scroll.reset();
    expect(scroll.step(wheel(0, 80, 200))).toBe(-1);
  });
  it("ignores zero and invalid input", () => {
    const scroll = new SoundWheelScroll();
    expect(scroll.step(wheel(0, 0))).toBe(0);
    expect(scroll.step(wheel(Infinity, 0))).toBe(0);
    expect(scroll.step(wheel(0, NaN))).toBe(0);
  });
});
