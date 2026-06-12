export interface ServiceProviderInvoice {
  id: string;
  invoiceNumber: string;
  serviceProviderId: string;
  serviceProviderName: string;
  billingCycleId: string;
  serviceId: string;
  serviceName: string;
  totalMembersPaid: number;
  totalPremiumsCollected: number;
  serviceProviderShare: number;
  platformOperatingFee: number;
  kznccShare: number;
  churchShare: number;
  invoiceStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';
  invoiceDate: string;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
}
