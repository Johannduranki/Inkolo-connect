import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, of } from 'rxjs';
import { KznccChurch } from '../models/kzncc-church.model';

@Injectable({ providedIn: 'root' })
export class KznccAdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/kzncc-admin/users';
  private readonly churchesSubject = new BehaviorSubject<KznccChurch[]>([
    {
      id: 1,
      name: 'Grace Community Church',
      denomination: 'Christian Community',
      region: 'Durban Central',
      province: 'KwaZulu-Natal',
      address: '14 Gospel Road, Durban',
      leaderName: 'Pastor N. Mthembu',
      leaderRole: 'Senior Pastor',
      contactNumber: '031 555 0101',
      email: 'office@gracecommunity.org.za',
      registeredMembers: 8200,
      activeMembers: 7100,
      paidServicesActivated: 2380,
      totalRevenue: 248000,
      churchRevenueShare: 74400,
      kznccRevenueShare: 49600,
      status: 'Active'
    },
    {
      id: 2,
      name: 'Zion Revival Church',
      denomination: 'Zionist',
      region: 'North Coast',
      province: 'KwaZulu-Natal',
      address: '7 Revival Street, KwaDukuza',
      leaderName: 'Bishop T. Khumalo',
      leaderRole: 'Bishop',
      contactNumber: '032 555 0134',
      email: 'admin@zionrevival.org.za',
      registeredMembers: 10300,
      activeMembers: 8900,
      paidServicesActivated: 3210,
      totalRevenue: 314000,
      churchRevenueShare: 94200,
      kznccRevenueShare: 62800,
      status: 'Active'
    },
    {
      id: 3,
      name: 'New Hope Christian Centre',
      denomination: 'Pentecostal',
      region: 'South Coast',
      province: 'KwaZulu-Natal',
      address: '22 Hope Avenue, Port Shepstone',
      leaderName: 'Pastor L. Sithole',
      leaderRole: 'Lead Pastor',
      contactNumber: '039 555 0182',
      email: 'hello@newhope.org.za',
      registeredMembers: 6900,
      activeMembers: 5700,
      paidServicesActivated: 1740,
      totalRevenue: 188000,
      churchRevenueShare: 56400,
      kznccRevenueShare: 37600,
      status: 'Active'
    },
    {
      id: 4,
      name: 'Durban Central Fellowship',
      denomination: 'Interdenominational',
      region: 'Durban Central',
      province: 'KwaZulu-Natal',
      address: '8 Fellowship Lane, Durban',
      leaderName: 'Reverend P. Dlamini',
      leaderRole: 'Reverend',
      contactNumber: '031 555 0198',
      email: 'connect@dcf.org.za',
      registeredMembers: 11200,
      activeMembers: 9600,
      paidServicesActivated: 3560,
      totalRevenue: 348000,
      churchRevenueShare: 104400,
      kznccRevenueShare: 69600,
      status: 'Active'
    },
    {
      id: 5,
      name: 'Pietermaritzburg Worship Centre',
      denomination: 'Evangelical',
      region: 'Midlands',
      province: 'KwaZulu-Natal',
      address: '41 Church Street, Pietermaritzburg',
      leaderName: 'Pastor S. Zulu',
      leaderRole: 'Senior Pastor',
      contactNumber: '033 555 0167',
      email: 'admin@pmworship.org.za',
      registeredMembers: 8400,
      activeMembers: 7200,
      paidServicesActivated: 1510,
      totalRevenue: 142000,
      churchRevenueShare: 42600,
      kznccRevenueShare: 28400,
      status: 'Pending'
    }
  ]);

  getKznccChurches(): Observable<KznccChurch[]> {
    return this.churchesSubject.asObservable();
  }

  getChurchById(churchId: number): Observable<KznccChurch | undefined> {
    return this.getKznccChurches().pipe(
      map((churches) => churches.find((church) => church.id === churchId))
    );
  }

  addChurch(church: Omit<KznccChurch, 'id'>): Observable<KznccChurch> {
    const created = {
      ...church,
      id: Math.max(0, ...this.churchesSubject.value.map(({ id }) => id)) + 1
    };
    this.churchesSubject.next([...this.churchesSubject.value, created]);
    return of(created);
  }

  updateChurch(
    churchId: number,
    updates: Partial<KznccChurch>
  ): Observable<KznccChurch | undefined> {
    let updated: KznccChurch | undefined;
    this.churchesSubject.next(
      this.churchesSubject.value.map((church) => {
        if (church.id !== churchId) {
          return church;
        }
        updated = { ...church, ...updates };
        return updated;
      })
    );
    return of(updated);
  }

  getChurchMembers(churchId: number): Observable<{ id: number; name: string }[]> {
    return of([
      { id: churchId * 100 + 1, name: 'Nandi Mthembu' },
      { id: churchId * 100 + 2, name: 'Thabo Khumalo' }
    ]);
  }

  linkMemberToChurch(memberId: number, churchId: number): Observable<boolean> {
    return of(memberId > 0 && churchId > 0);
  }

  getKznccUsers(): Observable<KznccManagedUser[]> {
    return this.http.get<KznccManagedUser[]>(this.apiUrl);
  }

  createKznccUser(user: {
    firstName: string;
    lastName: string;
    telephoneNumber: string;
    email: string;
    role: 'KZNCC User' | 'KZNCC Admin';
  }): Observable<KznccManagedUser> {
    return this.http.post<KznccManagedUser>(this.apiUrl, user);
  }

  removeKznccUser(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${userId}`);
  }
}

export interface KznccManagedUser {
  id: number;
  fullName: string;
  telephoneNumber: string;
  email: string;
  roles: ('Member' | 'KZNCC User' | 'KZNCC Admin')[];
}
