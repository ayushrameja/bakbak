import { describe, expect, it } from "vitest";

import {
  canAccessServer,
  canJoinVoice,
  canManageServer,
  canSendMessage,
  canViewChannel,
  type ServerMembership,
} from "./permissions";

const member: ServerMembership = {
  serverId: "server-one",
  userId: "user-one",
  role: "member",
  status: "active",
};

const deniedMemberships: Array<{
  description: string;
  membership: ServerMembership | null;
}> = [
  { membership: null, description: "a non-member" },
  {
    membership: { ...member, status: "revoked" },
    description: "a revoked member",
  },
  {
    membership: { ...member, serverId: "server-two" },
    description: "a member of another server",
  },
];

describe("server permissions", () => {
  it("allows an active member to access matching server resources", () => {
    expect(canAccessServer(member, "server-one")).toBe(true);
    expect(
      canViewChannel(member, { serverId: "server-one", kind: "text" }),
    ).toBe(true);
    expect(
      canSendMessage(member, { serverId: "server-one", kind: "text" }),
    ).toBe(true);
    expect(
      canJoinVoice(member, { serverId: "server-one", kind: "voice" }),
    ).toBe(true);
  });

  it("does not grant an operation to the wrong channel kind", () => {
    expect(
      canSendMessage(member, { serverId: "server-one", kind: "voice" }),
    ).toBe(false);
    expect(canJoinVoice(member, { serverId: "server-one", kind: "text" })).toBe(
      false,
    );
  });

  it.each(deniedMemberships)("denies $description", ({ membership }) => {
    expect(canAccessServer(membership, "server-one")).toBe(false);
    expect(
      canViewChannel(membership, { serverId: "server-one", kind: "text" }),
    ).toBe(false);
  });

  it("reserves server management for an active admin", () => {
    expect(canManageServer(member, "server-one")).toBe(false);
    expect(canManageServer({ ...member, role: "admin" }, "server-one")).toBe(
      true,
    );
    expect(
      canManageServer(
        { ...member, role: "admin", status: "revoked" },
        "server-one",
      ),
    ).toBe(false);
  });
});
