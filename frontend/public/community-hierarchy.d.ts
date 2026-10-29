export const inkoloTenantId: string;
export const legacyTraderTenantId: string;
export const traderCommunityId: string;
export const traderMemberCommunityId: string;
export function isTraderCommunity(row: any): boolean;
export function communityHierarchy(tenants?: any[], communities?: any[]): {tenants: any[]; communities: any[]};
