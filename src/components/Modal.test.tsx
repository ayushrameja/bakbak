import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Modal } from "./Modal";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open editor
      </button>
      {open ? (
        <Modal
          title="Responsive editor"
          size="wide"
          onClose={() => setOpen(false)}
        >
          <button type="button">First body action</button>
          <button type="button">Last body action</button>
        </Modal>
      ) : null}
    </>
  );
}

describe("Modal", () => {
  it("traps focus, closes with Escape, and restores focus to its opener", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Open editor" });

    await user.click(opener);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      screen.getByRole("button", { name: "Last body action" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("provides the wide bounded shell and an internally scrollable body", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Open editor" }));
    const dialog = screen.getByRole("dialog", { name: "Responsive editor" });

    expect(dialog).toHaveClass("modal-card--wide");
    expect(dialog.querySelector(".modal-card__body")).not.toBeNull();
  });
});
