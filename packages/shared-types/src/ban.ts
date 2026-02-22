export interface BannedMember {
  hubId: string;
  userId: string;
  bannedBy: string;
  reason?: string;
  bannedAt: string;
}
