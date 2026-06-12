export type BuySellCondition = 'NEW' | 'SECOND_HAND' | 'USED' | 'REFURBISHED';
export type BuySellListingStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'CANCELLED';

export interface BuySellListing {
  id: string;
  title: string;
  description: string;
  category: string;
  productType?: string;
  condition: BuySellCondition;
  price: number;
  area: string;
  images?: string[];
  sellerUserId: string;
  sellerName: string;
  sellerCommunityName?: string;
  sellerChurchName?: string;
  sellerBranchName?: string;
  sellerRating?: number;
  status: BuySellListingStatus;
  createdAt: string;
}

export interface BuySellFilters {
  query?: string;
  area?: string;
  category?: string;
  condition?: BuySellCondition | '';
  minPrice?: number;
  maxPrice?: number;
  community?: string;
  minimumRating?: number;
  status?: BuySellListingStatus | '';
}

export interface BuySellChatConversation {
  id: string;
  listingId: string;
  buyerUserId: string;
  sellerUserId: string;
  createdAt: string;
  status: 'ACTIVE' | 'CLOSED';
  listingTitle?: string;
  buyerName?: string;
  sellerName?: string;
}

export interface BuySellChatMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  messageType:
    | 'TEXT'
    | 'PAYMENT_REQUEST'
    | 'PAYMENT_CONFIRMATION'
    | 'LISTING_STATUS';
  messageText?: string;
  paymentRequestId?: string;
  createdAt: string;
}

export interface BuySellPaymentRequest {
  id: string;
  listingId: string;
  conversationId: string;
  requestedByUserId: string;
  requestedFromUserId: string;
  requestedAmount: number;
  description: string;
  status: 'PENDING' | 'PAID' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  paidAt?: string;
}

export interface BuySellWalletTransaction {
  buyerWalletId: string;
  sellerWalletId: string;
  listingId: string;
  paymentRequestId: string;
  amount: number;
  reference: string;
  status: 'COMPLETED';
  type: 'BUY_SELL_PAYMENT';
  createdAt: string;
}
