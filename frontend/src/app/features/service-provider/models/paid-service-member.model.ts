export interface PaidServiceMember {
  id: string;
  memberId: string;
  memberName: string;
  memberProfileNumber: string;
  cellphone: string;
  email: string;
  churchId?: string;
  churchName?: string;
  serviceProviderId: string;
  serviceId: string;
  serviceName: string;
  productName: string;
  planName: string;
  monthlyPremium: number;
  coverAmount?: number;
  policyNumber?: string;
  policyStatus: 'ACTIVE' | 'PENDING' | 'CANCELLED' | 'LAPSED';
  lastPaymentDate?: string;
  nextPaymentDueDate: string;
  billingCycleId: string;
  paymentStatus: 'PAID' | 'DUE' | 'FAILED' | 'OVERDUE';
  policyDocumentStatus: 'UPLOADED' | 'MISSING';
}
