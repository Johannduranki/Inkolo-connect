export type BusinessService =
  | 'BUY_SELL'
  | 'JOB_SEARCH'
  | 'KEYTCHA_PROPERTIES'
  | 'CATCH_A_RIDE';

export interface BusinessProfile {
  id: string;
  ownerUserId: string;
  businessName: string;
  registrationNumber?: string;
  telephone: string;
  email?: string;
  area: string;
  description: string;
  services: BusinessService[];
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface BusinessBulkResult {
  created: number;
  records: unknown[];
}
