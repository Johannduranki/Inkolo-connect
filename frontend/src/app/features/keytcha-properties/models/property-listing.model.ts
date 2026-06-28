export type PropertyListingType = 'RENT' | 'SALE';
export type PropertyType =
  | 'HOUSE'
  | 'APARTMENT'
  | 'ROOM'
  | 'TOWNHOUSE'
  | 'LAND'
  | 'COMMERCIAL';
export type PropertyListingStatus =
  | 'AVAILABLE'
  | 'UNDER_OFFER'
  | 'RENTED'
  | 'SOLD'
  | 'WITHDRAWN';

export interface PropertyListing {
  id: string;
  title: string;
  description: string;
  listingType: PropertyListingType;
  propertyType: PropertyType;
  price: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  area: string;
  address?: string;
  images?: string[];
  ownerUserId: string;
  ownerName: string;
  ownerTelephone?: string;
  ownerCommunityName?: string;
  businessProfileId?: string;
  businessName?: string;
  status: PropertyListingStatus;
  createdAt: string;
}

export interface PropertyFilters {
  query?: string;
  listingType?: PropertyListingType | '';
  propertyType?: PropertyType | '';
  area?: string;
  minPrice?: number;
  maxPrice?: number;
  minimumBedrooms?: number;
  status?: PropertyListingStatus | '';
}

export interface PropertyConversation {
  id: string;
  listingId: string;
  interestedUserId: string;
  ownerUserId: string;
  createdAt: string;
  status: 'ACTIVE' | 'CLOSED';
  listingTitle?: string;
  interestedUserName?: string;
  ownerName?: string;
}

export interface PropertyMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  messageText: string;
  createdAt: string;
}
