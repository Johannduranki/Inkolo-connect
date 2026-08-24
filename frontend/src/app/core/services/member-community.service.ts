import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Church,
  ChurchBranch,
  CommunityBranding,
  MemberCommunity
} from '../models/member-community.model';

@Injectable({ providedIn: 'root' })
export class MemberCommunityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform';

  getActiveChurches(): Observable<Church[]> {
    return this.http.get<Church[]>(`${this.apiUrl}/churches`);
  }

  getBranchesByChurch(churchId: string): Observable<ChurchBranch[]> {
    return this.http.get<ChurchBranch[]>(
      `${this.apiUrl}/churches/${churchId}/branches`
    );
  }

  getAdminChurches(): Observable<Church[]> {
    return this.http.get<Church[]>(`${this.apiUrl}/admin/churches`);
  }

  updateChurchBranding(
    churchId: string,
    branding: CommunityBranding
  ): Observable<Church> {
    return this.http.put<Church>(
      `${this.apiUrl}/admin/churches/${churchId}/branding`,
      branding
    );
  }

  uploadChurchLogo(churchId: string, logo: File): Observable<Church> {
    const formData = new FormData();
    formData.append('logo', logo);
    return this.http.post<Church>(
      `${this.apiUrl}/admin/churches/${churchId}/logo`,
      formData
    );
  }

  subscribeMemberToCommunity(
    memberId: string,
    churchId: string,
    branchId?: string
  ): Observable<MemberCommunity> {
    void memberId;
    return this.http.put<MemberCommunity>(`${this.apiUrl}/community/me`, {
      churchId,
      branchId
    });
  }

  getMemberCommunity(memberId: string): Observable<MemberCommunity | null> {
    void memberId;
    return this.http.get<MemberCommunity | null>(`${this.apiUrl}/community/me`);
  }

  getCommunityHeading(community: MemberCommunity | null): string {
    if (!community?.churchName) {
      return 'My Community';
    }
    return community.branchName
      ? `${community.churchName} - ${community.branchName}`
      : community.churchName;
  }
}
