export interface AirtimeDataPurchase {
  id: string;
  userId: string;
  purchaseType: 'AIRTIME' | 'DATA' | 'COMBO';
  buyingFor: 'MYSELF' | 'SOMEONE_ELSE';
  recipientName?: string;
  cellphoneNumber: string;
  network: 'VODACOM' | 'MTN' | 'CELL_C' | 'TELKOM' | 'RAIN' | 'OTHER';
  amount: number;
  bundleName?: string;
  dataSize?: string;
  validityPeriod?: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REVERSED';
  reference: string;
  createdAt: string;
}

export interface ElectricityPurchase {
  id: string;
  userId: string;
  buyingFor: 'MYSELF' | 'SOMEONE_ELSE';
  recipientName?: string;
  meterNumber: string;
  provider: string;
  amount: number;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REVERSED';
  token?: string;
  reference: string;
  createdAt: string;
}

export interface SavedBeneficiary {
  id: string;
  userId: string;
  beneficiaryName: string;
  beneficiaryType: 'AIRTIME' | 'DATA' | 'ELECTRICITY';
  cellphoneNumber?: string;
  network?: string;
  meterNumber?: string;
  provider?: string;
  createdAt: string;
}

export interface DataBundle {
  bundleName: string;
  network: AirtimeDataPurchase['network'];
  dataSize: string;
  validityPeriod: string;
  price: number;
}
