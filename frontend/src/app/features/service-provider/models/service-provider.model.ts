export interface ServiceProvider {
  id: string;
  name: string;
  providerType: 'FUNERAL_COVER' | 'FIBRE' | 'EDUCATION' | 'VAS' | 'INSURANCE' | 'OTHER';
  contactPerson: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}
