import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ServiceSubscriptionCount {
  serviceCode: string;
  count: number;
}

export interface AdminAnalytics {
  totalMembers: number;
  totalRegisteredUsers: number;
  totalActiveSubscriptions: number;
  subscriptionsByService: ServiceSubscriptionCount[];
}

@Injectable({ providedIn: 'root' })
export class AdminAnalyticsService {
  private readonly http = inject(HttpClient);

  getAnalytics(): Observable<AdminAnalytics> {
    return this.http.get<AdminAnalytics>('/api/platform/admin/analytics');
  }
}
