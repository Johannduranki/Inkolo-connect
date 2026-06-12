import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface MemberReferral {
  id: string;
  referrerName: string;
  referrerPhone: string;
  referredName: string;
  referredPhone: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  acknowledgedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ReferralService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/referrals';

  createReferral(referral: Omit<MemberReferral, 'id' | 'status' | 'createdAt'>): Observable<MemberReferral> {
    return this.http.post<MemberReferral>(this.apiUrl, referral);
  }

  getOutgoing(phone: string): Observable<MemberReferral[]> {
    const normalized = this.normalize(phone);
    return this.http
      .get<MemberReferral[]>(this.apiUrl)
      .pipe(
        map((items) =>
          items.filter(
            ({ referrerPhone }) => this.normalize(referrerPhone) === normalized
          )
        )
      );
  }

  getIncoming(phone: string): Observable<MemberReferral[]> {
    const normalized = this.normalize(phone);
    return this.http
      .get<MemberReferral[]>(this.apiUrl)
      .pipe(
        map((items) =>
          items.filter(
            ({ referredPhone }) => this.normalize(referredPhone) === normalized
          )
        )
      );
  }

  acknowledgeReferral(id: string, accepted: boolean): Observable<MemberReferral | undefined> {
    return this.http.patch<MemberReferral>(`${this.apiUrl}/${id}`, { accepted });
  }

  private normalize(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.startsWith('27') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  }
}
