export type SoundboardMembershipRole = "admin" | "member";

export function canManageSound(
  createdBy: string | null,
  userId: string,
  role: SoundboardMembershipRole,
): boolean {
  return role === "admin" || createdBy === userId;
}
