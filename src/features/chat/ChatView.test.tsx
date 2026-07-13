import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, Channel, ServerMember } from "../../lib/types";
import { ChatView } from "./ChatView";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  status: "online",
};
const member: ServerMember = { ...user, role: "admin" };
const channel: Channel = {
  id: "channel-1",
  serverId: "server-1",
  name: "lobby",
  kind: "text",
  position: 0,
  topic: "Friends only",
};

describe("ChatView controlled drafts", () => {
  it("renders the app-owned channel draft and clears it before sending", async () => {
    const onDraftChange = vi.fn();
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatView
        channel={channel}
        messages={[]}
        members={[member]}
        currentUser={user}
        sending={false}
        draft="still writing this"
        onDraftChange={onDraftChange}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("still writing this");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onDraftChange).toHaveBeenCalledWith("");
    expect(onSend).toHaveBeenCalledWith("still writing this");
  });
});
