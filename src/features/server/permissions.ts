export type MembershipRole = "admin" | "member";
export type MembershipStatus = "active" | "revoked";
export type ChannelKind = "text" | "voice";

export interface ServerMembership {
  serverId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

export interface ChannelAccessTarget {
  serverId: string;
  kind: ChannelKind;
}

export function isActiveServerMember(
  membership: ServerMembership | null | undefined,
  serverId: string,
): membership is ServerMembership {
  return membership?.serverId === serverId && membership.status === "active";
}

export function canAccessServer(
  membership: ServerMembership | null | undefined,
  serverId: string,
): boolean {
  return isActiveServerMember(membership, serverId);
}

export function canViewChannel(
  membership: ServerMembership | null | undefined,
  channel: ChannelAccessTarget,
): boolean {
  return isActiveServerMember(membership, channel.serverId);
}

export function canSendMessage(
  membership: ServerMembership | null | undefined,
  channel: ChannelAccessTarget,
): boolean {
  return channel.kind === "text" && canViewChannel(membership, channel);
}

export function canJoinVoice(
  membership: ServerMembership | null | undefined,
  channel: ChannelAccessTarget,
): boolean {
  return channel.kind === "voice" && canViewChannel(membership, channel);
}

export function canManageServer(
  membership: ServerMembership | null | undefined,
  serverId: string,
): boolean {
  return (
    isActiveServerMember(membership, serverId) && membership.role === "admin"
  );
}
