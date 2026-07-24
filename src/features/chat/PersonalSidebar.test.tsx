import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, ServerMember } from "../../lib/types";
import { PersonalSidebar } from "./PersonalSidebar";
import type { useVoiceRoom } from "../voice/useVoiceRoom";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "online",
};

const friend: ServerMember = {
  ...user,
  id: "friend-1",
  displayName: "A magnificently long member name that must not break the panel",
  email: "friend@example.test",
  role: "member",
};

function renderSidebar() {
  return render(
    <PersonalSidebar
      user={user}
      members={[user as ServerMember, friend]}
      conversations={[]}
      selectedConversationId={null}
      voice={
        {
          status: "disconnected",
          channel: null,
          muted: false,
          deafened: false,
        } as unknown as ReturnType<typeof useVoiceRoom>
      }
      mode="mock"
      soundboardOpen={false}
      onSelect={vi.fn()}
      onStartConversation={vi.fn().mockResolvedValue(undefined)}
      onOpenSettings={vi.fn()}
      onToggleSoundboard={vi.fn()}
      onOpenScreenShare={vi.fn()}
      loadProfileMedia={vi.fn().mockResolvedValue(null)}
      onOpenProfile={vi.fn()}
      openProfileId={null}
    />,
  );
}

describe("PersonalSidebar member picker", () => {
  it("opens without overflowing names and closes on an outside pointer", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "New message" }));
    expect(
      screen.getByRole("dialog", { name: "Choose a club member" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: friend.displayName }),
    ).toBeVisible();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("dialog", { name: "Choose a club member" }),
    ).not.toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the opener", async () => {
    renderSidebar();
    const opener = screen.getByRole("button", { name: "New message" });
    await userEvent.click(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
