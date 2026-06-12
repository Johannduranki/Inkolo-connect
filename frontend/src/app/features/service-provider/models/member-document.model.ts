export interface MemberDocument {
  id: string;
  memberId: string;
  serviceProviderId?: string;
  serviceId?: string;
  policyNumber?: string;
  documentType: 'FUNERAL_COVER_POLICY' | 'INSURANCE_DOCUMENT' | 'SERVICE_AGREEMENT' | 'INVOICE' | 'RECEIPT' | 'OTHER';
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  status: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED';
  expiryDate?: string;
}
