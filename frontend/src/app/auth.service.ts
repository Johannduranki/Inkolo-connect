import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import type { UserRole } from './core/services/role.service';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  idNumberLast4: string;
  membershipType: 'free' | 'paid' | null;
  roles: UserRole[];
}

export interface ServiceSubscription {
  serviceCode: string;
  planCode: string;
  planLabel: string;
  amountCents: number;
  status: 'active' | 'cancelled';
  subscribedAt: string;
}

export interface ServiceApplication {
  serviceCode: string;
  status: 'submitted' | 'approved' | 'declined';
  submittedAt: string;
}

interface LoginResponse {
  accessToken: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api';
  private readonly tokenKey = 'duranki_access_token';
  private inMemoryToken: string | null = null;

  login(
    telephoneNumber: string,
    firstName: string,
    lastName: string
  ): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, {
        telephoneNumber,
        firstName,
        lastName
      })
      .pipe(tap(({ accessToken }) => this.storeToken(accessToken)));
  }

  register(
    telephoneNumber: string,
    firstName: string,
    lastName: string
  ): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/register`, {
        telephoneNumber,
        firstName,
        lastName
      })
      .pipe(tap(({ accessToken }) => this.storeToken(accessToken)));
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/auth/me`);
  }

  getSubscriptions(): Observable<ServiceSubscription[]> {
    return this.http.get<ServiceSubscription[]>(`${this.apiUrl}/subscriptions`);
  }

  subscribeToService(
    serviceCode: string,
    planCode: string,
    acceptedTerms: boolean
  ): Observable<ServiceSubscription> {
    return this.http.post<ServiceSubscription>(`${this.apiUrl}/subscriptions`, {
      serviceCode,
      planCode,
      acceptance: {
        accepted: acceptedTerms
      }
    });
  }

  resetServiceSubscriptions(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/subscriptions`);
  }

  applyForStepUpBoost(
    bankConfirmation: File,
    idDocument: File
  ): Observable<ServiceApplication> {
    const formData = new FormData();
    formData.append('bankConfirmation', bankConfirmation);
    formData.append('idDocument', idDocument);

    return this.http.post<ServiceApplication>(
      `${this.apiUrl}/applications/step-up-boost`,
      formData
    );
  }

  getToken(): string | null {
    if (this.inMemoryToken) {
      return this.inMemoryToken;
    }

    try {
      return sessionStorage.getItem(this.tokenKey) || localStorage.getItem(this.tokenKey);
    } catch {
      try {
        return localStorage.getItem(this.tokenKey);
      } catch {
        return null;
      }
    }
  }

  isAuthenticated(): boolean {
    return Boolean(this.getToken());
  }

  logout(): void {
    this.inMemoryToken = null;

    try {
      sessionStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.tokenKey);
    } catch {
      try {
        localStorage.removeItem(this.tokenKey);
      } catch {
        // Some embedded browsers disable browser storage.
      }
    }
  }

  private storeToken(token: string): void {
    this.inMemoryToken = token;

    try {
      sessionStorage.setItem(this.tokenKey, token);
      localStorage.setItem(this.tokenKey, token);
    } catch {
      try {
        localStorage.setItem(this.tokenKey, token);
      } catch {
        // The in-memory token keeps the current session usable.
      }
    }
  }
}
