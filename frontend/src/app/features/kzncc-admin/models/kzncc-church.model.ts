export type ChurchStatus = 'Active' | 'Pending' | 'Suspended';

export interface KznccChurch {
  id: number;
  name: string;
  registrationNumber?: string;
  denomination: string;
  region: string;
  province: string;
  address: string;
  leaderName: string;
  leaderRole: string;
  contactNumber: string;
  email: string;
  registeredMembers: number;
  activeMembers: number;
  paidServicesActivated: number;
  totalRevenue: number;
  churchRevenueShare: number;
  kznccRevenueShare: number;
  status: ChurchStatus;
  notes?: string;
}
