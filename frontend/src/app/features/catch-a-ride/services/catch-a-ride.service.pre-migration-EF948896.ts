import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AvailableLift,
  LiftOfferInput,
  RideRequest,
  RideRequestStatus
} from '../models/catch-a-ride.model';

@Injectable({ providedIn: 'root' })
export class CatchARideService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/rides';

  getAvailableLifts(): Observable<AvailableLift[]> {
    return this.http.get<AvailableLift[]>(`${this.apiUrl}/available`);
  }

  getMyLiftOffer(): Observable<AvailableLift | null> {
    return this.http.get<AvailableLift | null>(`${this.apiUrl}/offers/mine`);
  }

  publishLiftOffer(offer: LiftOfferInput): Observable<AvailableLift> {
    return this.http.post<AvailableLift>(`${this.apiUrl}/offers`, offer);
  }

  updateLiftAvailability(available: boolean): Observable<AvailableLift> {
    return this.http.patch<AvailableLift>(`${this.apiUrl}/offers/mine`, {
      available
    });
  }

  getMyRequests(): Observable<{
    outgoing: RideRequest[];
    incoming: RideRequest[];
  }> {
    return this.http.get<{ outgoing: RideRequest[]; incoming: RideRequest[] }>(
      `${this.apiUrl}/requests`
    );
  }

  requestLift(
    liftId: string,
    location: {
      latitude: number;
      longitude: number;
      pickupLabel: string;
    }
  ): Observable<RideRequest> {
    return this.http.post<RideRequest>(`${this.apiUrl}/requests`, {
      liftId,
      ...location
    });
  }

  updateRequest(
    requestId: string,
    status: RideRequestStatus
  ): Observable<RideRequest> {
    return this.http.patch<RideRequest>(
      `${this.apiUrl}/requests/${requestId}`,
      { status }
    );
  }
}
