import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  PropertyConversation,
  PropertyFilters,
  PropertyListing,
  PropertyListingStatus,
  PropertyMessage
} from '../models/property-listing.model';

@Injectable({ providedIn: 'root' })
export class KeytchaPropertiesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/properties';

  getListings(): Observable<PropertyListing[]> {
    return this.http.get<PropertyListing[]>(`${this.apiUrl}/listings`);
  }

  searchListings(filters: PropertyFilters): Observable<PropertyListing[]> {
    return this.getListings().pipe(
      map((listings) =>
        listings.filter((listing) => {
          const query = filters.query?.trim().toLowerCase();
          const area = filters.area?.trim().toLowerCase();
          return (
            (!query ||
              listing.title.toLowerCase().includes(query) ||
              listing.description.toLowerCase().includes(query) ||
              listing.area.toLowerCase().includes(query)) &&
            (!area || listing.area.toLowerCase().includes(area)) &&
            (!filters.listingType || listing.listingType === filters.listingType) &&
            (!filters.propertyType || listing.propertyType === filters.propertyType) &&
            (!filters.minPrice || listing.price >= filters.minPrice) &&
            (!filters.maxPrice || listing.price <= filters.maxPrice) &&
            (!filters.minimumBedrooms ||
              listing.bedrooms >= filters.minimumBedrooms) &&
            (!filters.status || listing.status === filters.status)
          );
        })
      )
    );
  }

  createListing(
    listing: Omit<PropertyListing, 'id' | 'createdAt'>
  ): Observable<PropertyListing> {
    return this.http.post<PropertyListing>(`${this.apiUrl}/listings`, listing);
  }

  updateListingStatus(
    listingId: string,
    status: PropertyListingStatus
  ): Observable<PropertyListing> {
    return this.http.patch<PropertyListing>(
      `${this.apiUrl}/listings/${listingId}`,
      { status }
    );
  }

  startConversation(listingId: string): Observable<PropertyConversation> {
    return this.http.post<PropertyConversation>(
      `${this.apiUrl}/listings/${listingId}/conversations`,
      {}
    );
  }

  getConversations(): Observable<PropertyConversation[]> {
    return this.http.get<PropertyConversation[]>(`${this.apiUrl}/conversations`);
  }

  getMessages(conversationId: string): Observable<PropertyMessage[]> {
    return this.http.get<PropertyMessage[]>(
      `${this.apiUrl}/conversations/${conversationId}/messages`
    );
  }

  sendMessage(
    conversationId: string,
    messageText: string
  ): Observable<PropertyMessage> {
    return this.http.post<PropertyMessage>(
      `${this.apiUrl}/conversations/${conversationId}/messages`,
      { messageText }
    );
  }
}
