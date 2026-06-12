export interface BillingCycle {
  id: string;
  serviceProviderId: string;
  serviceId: string;
  serviceName: string;
  cycleName: string;
  startDate: string;
  endDate: string;
  paymentDueDate: string;
  billingFrequency: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  status: 'OPEN' | 'CLOSED' | 'PROCESSING' | 'COMPLETED';
  totalMembersBilled: number;
  totalMembersPaid: number;
  totalFailedPayments: number;
  totalOverduePayments: number;
  totalAmountCollected: number;
  totalAmountPayableToProvider: number;
}
