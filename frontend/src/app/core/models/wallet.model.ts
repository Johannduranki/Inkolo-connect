export type WalletOwnerType =
  | 'MEMBER'
  | 'CHURCH'
  | 'KZNCC'
  | 'BISHOP_GROUP'
  | 'PLATFORM';

export type WalletTransactionType =
  | 'TITHE_PAYMENT'
  | 'OFFERING_PAYMENT'
  | 'PAID_SERVICE_REVENUE'
  | 'KZNCC_REVENUE_SHARE'
  | 'CHURCH_REVENUE_SHARE'
  | 'MEMBER_PAYMENT'
  | 'SERVICE_PROVIDER_SETTLEMENT'
  | 'PLATFORM_OPERATING_FEE'
  | 'WALLET_TOPUP'
  | 'WALLET_WITHDRAWAL'
  | 'WALLET_TRANSFER'
  | 'AIRTIME_PURCHASE'
  | 'DATA_PURCHASE'
  | 'ELECTRICITY_PURCHASE'
  | 'BUY_SELL_PAYMENT'
  | 'JOB_PAYMENT'
  | 'REFUND'
  | 'ADJUSTMENT';

export interface Wallet {
  id: string;
  ownerType: WalletOwnerType;
  ownerId: string;
  walletName: string;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  currency: 'ZAR';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  transactionType: WalletTransactionType;
  amount: number;
  direction: 'IN' | 'OUT';
  description: string;
  sourceWalletId?: string;
  destinationWalletId?: string;
  memberId?: string;
  churchId?: string;
  serviceId?: string;
  reference: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'REVERSED';
  createdAt: string;
}

export interface CycleTopUpRequest {
  memberId: string;
  amount: number;
  returnUrl: string;
}

export interface AfricanBankCashOutRequest {
  memberId: string;
  amount: number;
  accountHolder: string;
  accountNumber: string;
  accountType: 'SAVINGS' | 'CURRENT';
  branchCode: string;
}

export interface MemberWalletTransferRequest {
  senderMemberId: string;
  senderTelephoneNumber: string;
  recipientTelephoneNumber: string;
  amount: number;
  paymentReference?: string;
}

export interface WalletOperationResult {
  successful: boolean;
  reference: string;
  amount: number;
  message: string;
  redirectUrl?: string;
  recipientName?: string;
}

export interface ChurchWalletSummary {
  churchId: string;
  churchName: string;
  pastorName: string;
  totalTithes: number;
  totalOfferings: number;
  totalPaidServiceRevenueShare: number;
  walletBalance: number;
  pendingPayouts: number;
  memberCount: number;
}

export interface BishopWalletSummary {
  bishopId: string;
  bishopName: string;
  assignedChurches: ChurchWalletSummary[];
  totalWalletBalance: number;
  totalTithes: number;
  totalOfferings: number;
  totalRevenueShare: number;
  totalMembers: number;
}

export interface KznccWalletSummary {
  kznccId: string;
  walletBalance: number;
  totalRevenueShare: number;
  monthlyRevenueShare: number;
  revenueByService: { serviceName: string; amount: number }[];
  revenueByChurch: { churchName: string; amount: number }[];
  pendingPayouts: number;
}
