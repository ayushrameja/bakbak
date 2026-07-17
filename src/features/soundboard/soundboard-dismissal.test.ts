import { describe, expect, it } from "vitest";
import {
  shouldDismissSoundboardForEscape,
  shouldDismissSoundboardForPointer,
} from "./soundboard-dismissal";

describe("soundboard dismissal", () => {
  it("dismisses outside pointer interactions", () => {
    const drawer = document.createElement("aside");
    const outside = document.createElement("button");
    expect(shouldDismissSoundboardForPointer(outside, drawer)).toBe(true);
  });

  it("keeps the drawer open for the drawer, both triggers, and its edit modal", () => {
    const drawer = document.createElement("aside");
    const drawerChild = document.createElement("button");
    const trigger = document.createElement("button");
    const modal = document.createElement("section");
    drawer.append(drawerChild);
    trigger.setAttribute("aria-controls", "soundboard-drawer");
    modal.dataset.overlayOwner = "soundboard";

    expect(shouldDismissSoundboardForPointer(drawerChild, drawer)).toBe(false);
    expect(shouldDismissSoundboardForPointer(trigger, drawer)).toBe(false);
    expect(shouldDismissSoundboardForPointer(modal, drawer)).toBe(false);
  });

  it("lets an owned edit modal consume Escape before the drawer", () => {
    expect(shouldDismissSoundboardForEscape("Escape", true)).toBe(false);
    expect(shouldDismissSoundboardForEscape("Escape", false)).toBe(true);
    expect(shouldDismissSoundboardForEscape("Enter", false)).toBe(false);
  });
});
