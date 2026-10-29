import { Injectable, inject } from '@angular/core';
import {languageSession,resetLanguage} from '../../public/language.js';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../environments/environment';
import { RoleService, type UserRole } from './core/services/role.service';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  idNumberLast4: string;
  membershipType: 'free' | 'paid' | null;
  roles: UserRole[];
  communityMembershipAccess?: {
    exempt: boolean;
    reason: 'platform_admin_testing' | null;
    scope: 'all_communities' | null;
  };
}

export interface ServiceSubscription {
  id?: string;
  provider?: string;
  communityId?: string;
  serviceCode: string;
  planCode: string;
  planLabel: string;
  amountCents: number;
  status: 'active' | 'cancelled' | 'pending';
  subscribedAt: string;
}

export interface ServiceApplication {
  serviceCode: string;
  status: 'submitted' | 'approved' | 'declined';
  submittedAt: string;
}

interface LoginResponse {
  mfaRequired?: boolean;
  accessToken: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly roles = inject(RoleService);
  private readonly apiUrl = environment.apiUrl;
  private readonly tokenKey = 'duranki_access_token';
  private inMemoryToken: string | null = null;

  login(
    telephoneNumber: string,
    firstName: string,
    lastName: string,
    password: string
  ): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, {
        telephoneNumber,
        firstName,
        lastName,
        password
      })
      .pipe(tap(({ accessToken, mfaRequired }) => {
        if (mfaRequired) {
          this.inMemoryToken = null;
          sessionStorage.setItem('duranki_mfa_challenge', accessToken);
          sessionStorage.removeItem(this.tokenKey);
          localStorage.removeItem(this.tokenKey);
        } else {
          sessionStorage.removeItem('duranki_mfa_challenge');
          this.storeToken(accessToken);
        }
      }));
  }

  register(
    telephoneNumber: string,
    firstName: string,
    lastName: string,
    password: string,
    identity: { idNumber: string; dateOfBirth: string; gender: string; privacyAccepted: boolean; idDocument: File | null; address?: string; city?: string; region?: string; postalCode?: string; country?: string }
  ): Observable<LoginResponse> {
    const body = new FormData();
    for (const [key, value] of Object.entries({ telephoneNumber, firstName, lastName, password,
      idNumber: identity.idNumber, dateOfBirth: identity.dateOfBirth, gender: identity.gender,
      address: identity.address || '', city: identity.city || '', region: identity.region || '', postalCode: identity.postalCode || '', country: identity.country || '',
      privacyAccepted: String(identity.privacyAccepted) })) body.append(key, value);
    if (identity.idDocument) body.append('idDocument', identity.idDocument);
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/register`, body)
      .pipe(tap(({ accessToken }) => this.storeToken(accessToken)));
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/auth/me`);
  }

  getSubscriptions(): Observable<ServiceSubscription[]> {
    return this.http.get<ServiceSubscription[]>(`${this.apiUrl}/subscriptions?communityId=${encodeURIComponent(new URLSearchParams(location.search).get('communityId')||'')}`);
  }

  subscribeToService(
    serviceCode: string,
    planCode: string,
    acceptedTerms: boolean
  ): Observable<ServiceSubscription> {
    return this.http.post<ServiceSubscription>(`${this.apiUrl}/subscriptions`, {
      serviceCode,
      planCode,
      communityId: new URLSearchParams(window.location.search).get('communityId') || '',
      acceptance: {
        accepted: acceptedTerms
      }
    });
  }

  resetServiceSubscriptions(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/subscriptions`);
  }

  cancelSubscription(subscription: ServiceSubscription): Observable<{message:string}> {
    return this.http.post<{message:string}>(`${this.apiUrl}/subscriptions/cancel`, {
      serviceCode:subscription.serviceCode, communityId:subscription.communityId || '',
      provider:subscription.provider, id:subscription.id
    });
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
    resetLanguage();
    const token = this.getToken();
    if (token) void fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
    this.inMemoryToken = null;
    this.roles.clearUser();

    try {
      sessionStorage.removeItem(this.tokenKey);
      sessionStorage.removeItem('duranki_mfa_challenge');
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
    void languageSession(token,this.apiUrl+'/preferences/language').catch(()=>window.dispatchEvent(new Event('duranki-language-save-error')));

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
