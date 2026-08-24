import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BusinessBulkResult,
  BusinessProfile,
  BusinessService
} from '../models/business-profile.model';

@Injectable({ providedIn: 'root' })
export class BusinessProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/businesses';

  getMyBusinesses(): Observable<BusinessProfile[]> {
    return this.http.get<BusinessProfile[]>(`${this.apiUrl}/mine`);
  }

  registerBusiness(
    business: Omit<BusinessProfile, 'id' | 'ownerUserId' | 'status' | 'createdAt'>
  ): Observable<BusinessProfile> {
    return this.http.post<BusinessProfile>(this.apiUrl, business);
  }

  bulkPublish(
    businessId: string,
    service: BusinessService,
    records: Record<string, unknown>[]
  ): Observable<BusinessBulkResult> {
    return this.http.post<BusinessBulkResult>(
      `${this.apiUrl}/${businessId}/bulk`,
      { service, records }
    );
  }
}
