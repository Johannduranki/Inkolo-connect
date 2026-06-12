import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface MemberProfile {
  idNumber: string;
  telephoneNumber: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
}

const emptyProfile: MemberProfile = {
  idNumber: '',
  telephoneNumber: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  emergencyContactName: '',
  emergencyContactNumber: ''
};

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/profile';
  readonly profile = signal<MemberProfile>({ ...emptyProfile });

  save(profile: MemberProfile): void {
    this.profile.set(profile);
    this.http.put<MemberProfile>(this.apiUrl, profile).subscribe({
      next: (saved) => this.profile.set({ ...emptyProfile, ...saved })
    });
  }

  load(): Observable<MemberProfile | null> {
    return this.http.get<MemberProfile | null>(this.apiUrl).pipe(
      tap((profile) => this.profile.set({ ...emptyProfile, ...(profile ?? {}) }))
    );
  }
}
