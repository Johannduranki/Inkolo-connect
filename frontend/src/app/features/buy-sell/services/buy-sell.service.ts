import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  BuySellFilters,
  BuySellListing,
  BuySellListingStatus
} from '../models/buy-sell.model';

@Injectable({ providedIn: 'root' })
export class BuySellService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/marketplace/listings';

  getBuySellListings(): Observable<BuySellListing[]> {
    return this.http.get<BuySellListing[]>(this.apiUrl);
  }

  searchBuySellListings(filters: BuySellFilters): Observable<BuySellListing[]> {
    return this.getBuySellListings().pipe(
      map((listings) =>
        listings.filter((listing) => {
          const query = filters.query?.trim().toLowerCase();
          const community = filters.community?.trim().toLowerCase();
          return (
            (!query ||
              listing.title.toLowerCase().includes(query) ||
              listing.description.toLowerCase().includes(query)) &&
            (!filters.area || listing.area === filters.area) &&
            (!filters.category || listing.category === filters.category) &&
            (!filters.condition || listing.condition === filters.condition) &&
            (!filters.minPrice || listing.price >= filters.minPrice) &&
            (!filters.maxPrice || listing.price <= filters.maxPrice) &&
            (!community ||
              [listing.sellerCommunityName, listing.sellerChurchName, listing.sellerBranchName]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(community))) &&
            (!filters.minimumRating ||
              (listing.sellerRating ?? 0) >= filters.minimumRating) &&
            (!filters.status || listing.status === filters.status)
          );
        })
      )
    );
  }

  getListingById(listingId: string): Observable<BuySellListing | undefined> {
    return this.getBuySellListings().pipe(
      map((listings) => listings.find(({ id }) => id === listingId))
    );
  }

  createBuySellListing(
    listing: Omit<BuySellListing, 'id' | 'createdAt'>
  ): Observable<BuySellListing> {
    return this.http.post<BuySellListing>(this.apiUrl, listing);
  }

  updateListingStatus(
    listingId: string,
    status: BuySellListingStatus
  ): Observable<BuySellListing | undefined> {
    return this.http.patch<BuySellListing>(`${this.apiUrl}/${listingId}`, {
      status
    });
  }
}
