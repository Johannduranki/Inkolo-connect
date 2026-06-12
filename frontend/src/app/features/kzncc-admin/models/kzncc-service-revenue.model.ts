export type KznccServiceType = 'FREE' | 'PAID';

export interface KznccServiceRevenue {
  id: number;
  serviceName: string;
  serviceType: KznccServiceType;
  membersSubscribed: number;
  monthlyPrice: number;
  totalRevenue: number;
  serviceProviderRate: number;
  operatingRate: number;
  kznccRate: number;
  churchRate: number;
  serviceProviderShare: number;
  operatingCost: number;
  kznccShare: number;
  churchShare: number;
  netPayableToKzncc: number;
  netPayableToChurches: number;
}

export interface KznccRevenueSummary {
  paidServicesActive: number;
  totalMonthlyRevenue: number;
  serviceProviderShare: number;
  operatingCost: number;
  kznccRevenueShare: number;
  churchRevenueShare: number;
}
