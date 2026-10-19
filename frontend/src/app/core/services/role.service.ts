import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export type UserRole =
  | 'Member'
  | 'Platform Admin'
  | 'Tenant Staff'
  | 'Accountant'
  | 'Pastor'
  | 'Bishop'
  | 'Admin User'
  | 'KZNCC User'
  | 'KZNCC Admin'
  | 'Service Provider Admin'
  | 'Service Provider User';

export interface RoleMenuItem {
  label: string;
  description: string;
  route?: string;
}

export interface CommunityMemberRoleAssignment {
  id: number;
  fullName: string;
  telephoneNumber: string;
  isCurrentUser?: boolean;
  roles: UserRole[];
}

export interface UserServiceResetSummary {
  subscriptionsDeleted: number;
  applicationsDeleted: number;
  agreementsDeleted: number;
  documentsDeleted: number;
}

export interface AdminMemberProfile {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  telephoneNumber: string;
  email: string;
  roles: UserRole[];
  profile: {
    profilePhoto?: string;
    idNumber?: string;
    telephoneNumber?: string;
    email?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    emergencyContactName?: string;
    emergencyContactNumber?: string;
  } | null;
  community: {
    churchName?: string;
    branchName?: string;
  } | null;
}

const ROLE_ROUTES: Record<UserRole, string> = {
  Member: '/dashboard/member',
  'Platform Admin': '/dashboard/platform-admin',
  'Tenant Staff': '/dashboard/tenant',
  Accountant: '/dashboard/accounting',
  Pastor: '/dashboard/pastor',
  Bishop: '/dashboard/bishop',
  'Admin User': '/dashboard/admin-user',
  'KZNCC User': '/dashboard/kzncc-user',
  'KZNCC Admin': '/dashboard/kzncc-admin',
  'Service Provider Admin': '/dashboard/service-provider-admin',
  'Service Provider User': '/dashboard/service-provider-user'
};

const ROLE_MENUS: Record<UserRole, RoleMenuItem[]> = {
  Accountant: [{ label: 'Accounting', description: 'Recorded accounting data.', route: '/dashboard/accounting' }],
  'Platform Admin': [{ label: 'Platform overview', description: 'Platform administration.', route: '/dashboard/platform-admin' }],
  'Tenant Staff': [{ label: 'Tenant workspace', description: 'Authorized tenant dashboards.', route: '/dashboard/tenant' }],
  Member: [
    { label: 'My services', description: 'Manage active Duranki services.', route: '/dashboard/member' },
    { label: 'My community', description: 'Open your church community.', route: '/community' },
    { label: 'My profile', description: 'Review your personal details.' }
  ],
  Pastor: [
    { label: 'Congregation', description: 'View members and ministry groups.' },
    { label: 'Church notices', description: 'Prepare updates for church members.' },
    { label: 'Services and events', description: 'Manage the church programme.' }
  ],
  Bishop: [
    { label: 'Regional churches', description: 'View churches in your region.' },
    { label: 'Pastor oversight', description: 'Review leadership activity.' },
    { label: 'Regional communication', description: 'Share regional notices.' }
  ],
  'Admin User': [
    { label: 'User administration', description: 'Manage platform users and access.' },
    { label: 'Service administration', description: 'Review services and subscriptions.' },
    { label: 'Platform reports', description: 'View operational summaries.' }
  ],
  'KZNCC User': [
    { label: 'Announcements', description: 'Publish and update official subscriber announcements.', route: '/dashboard/kzncc-user' },
    { label: 'Council communication', description: 'Post messages for KZNCC subscribers.', route: '/dashboard/kzncc-user' },
    { label: 'Events', description: 'Create and update subscriber events.', route: '/dashboard/kzncc-user' }
  ],
  'KZNCC Admin': [
    { label: 'KZNCC staff access', description: 'Add or remove KZNCC Users and KZNCC Admins.' },
    { label: 'Paid-service revenue', description: 'Review KZNCC revenue share from paid services.' },
    { label: 'Council administration', description: 'Manage churches, settlements and revenue reporting.' }
  ],
  'Service Provider Admin': [
    { label: 'Paid members', description: 'View members linked to your paid services.' },
    { label: 'Billing cycles', description: 'Review payment and collection cycles.' },
    { label: 'Invoices', description: 'Prepare and submit provider invoices.' },
    { label: 'Policy documents', description: 'Upload member policy documents.' }
  ],
  'Service Provider User': [
    { label: 'Assigned members', description: 'View members linked to assigned services.' },
    { label: 'Billing cycles', description: 'Review assigned billing cycles.' },
    { label: 'Documents', description: 'Upload policies when permission allows.' }
  ]
};

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform';
  private readonly currentUserStorageKey = 'duranki_current_user_id';
  private currentUserId = 0;
  private identityGeneration = 0;
  private directoryGeneration = 0;
  readonly roleUpdateErrorSubject = new BehaviorSubject<string>('');
  readonly allRoles: UserRole[] = [
    'Member',
    'Pastor',
    'Bishop',
    'Admin User',
    'KZNCC User',
    'KZNCC Admin',
    'Service Provider Admin',
    'Service Provider User'
  ];
  private readonly userRolesSubject = new BehaviorSubject<UserRole[]>([]);
  private readonly activeRoleSubject = new BehaviorSubject<UserRole>('Member');
  private readonly communityMembersSubject =
    new BehaviorSubject<CommunityMemberRoleAssignment[]>([]);

  readonly activeRole$: Observable<UserRole> = this.activeRoleSubject.asObservable();

  getUserRoles(): Observable<UserRole[]> {
    return this.userRolesSubject.asObservable();
  }

  getCommunityMembers(): Observable<CommunityMemberRoleAssignment[]> {
    const generation = this.identityGeneration;
    const request = ++this.directoryGeneration;
    this.communityMembersSubject.next([]);
    this.http
      .get<
        {
          id: number;
          fullName: string;
          telephoneNumber: string;
          roles: UserRole[];
        }[]
      >(`${this.apiUrl}/admin/users`)
      .subscribe({
        next: (members) => {
          if (generation !== this.identityGeneration || request !== this.directoryGeneration) return;
          this.communityMembersSubject.next(
            members.map((member) => ({
              ...member,
              isCurrentUser: member.id === this.currentUserId
            }))
          );
        },
        error: () => {
          if (generation === this.identityGeneration && request === this.directoryGeneration) this.communityMembersSubject.next([]);
        }
      });
    return this.communityMembersSubject.asObservable();
  }

  createUser(user: {
    firstName: string;
    lastName: string;
    telephoneNumber: string;
    email: string;
    roles: UserRole[];
  }): Observable<CommunityMemberRoleAssignment> {
    return this.http
      .post<CommunityMemberRoleAssignment>(`${this.apiUrl}/admin/users`, user)
      .pipe(
        tap((created) =>
          this.communityMembersSubject.next([
            ...this.communityMembersSubject.value,
            created
          ])
        )
      );
  }

  removeUser(userId: number): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/admin/users/${userId}`)
      .pipe(
        tap(() =>
          this.communityMembersSubject.next(
            this.communityMembersSubject.value.filter(({ id }) => id !== userId)
          )
        )
      );
  }

  resetUserServiceData(
    userId: number
  ): Observable<UserServiceResetSummary> {
    return this.http.delete<UserServiceResetSummary>(
      `${this.apiUrl}/admin/users/${userId}/service-data`
    );
  }

  getAdminMemberProfile(userId: number): Observable<AdminMemberProfile> {
    return this.http.get<AdminMemberProfile>(
      `${this.apiUrl}/admin/users/${userId}/profile`
    );
  }

  getActiveRole(): UserRole {
    return this.activeRoleSubject.value;
  }

  initializeUser(
    userId: number,
    defaultRoles: UserRole[],
    fullName?: string
  ): void {
    if (this.currentUserId !== userId) {
      this.identityGeneration++;
      this.communityMembersSubject.next([]);
    }
    this.currentUserId = userId;
    localStorage.setItem(this.currentUserStorageKey, String(userId));
    const assignedRoles = [...new Set(defaultRoles)];
    this.userRolesSubject.next(assignedRoles);
    this.communityMembersSubject.next(
      this.communityMembersSubject.value.map((member) => ({
        ...member,
        fullName: member.id === userId && fullName ? fullName : member.fullName,
        isCurrentUser: member.id === userId,
        roles: member.id === userId ? assignedRoles : member.roles
      }))
    );
    const storedRole = localStorage.getItem(this.activeRoleKey(userId));
    const activeRole =
      storedRole && assignedRoles.includes(storedRole as UserRole)
        ? (storedRole as UserRole)
        : assignedRoles[0] ?? 'Member';
    this.activeRoleSubject.next(activeRole);
  }

  setActiveRole(role: string): boolean {
    if (!this.canAccessRole(role)) {
      return false;
    }

    const assignedRole = role as UserRole;
    this.activeRoleSubject.next(assignedRole);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.activeRoleKey(this.currentUserId), assignedRole);
    }

    return true;
  }

  canAccessRole(role: string): boolean {
    return this.userRolesSubject.value.includes(role as UserRole);
  }

  getDashboardRouteForRole(role: string): string {
    return ROLE_ROUTES[role as UserRole] ?? ROLE_ROUTES.Member;
  }

  getMenuItemsForRole(role: string): RoleMenuItem[] {
    return ROLE_MENUS[role as UserRole] ?? ROLE_MENUS.Member;
  }

  setUserRoles(roles: UserRole[]): void {
    const assignedRoles = [...new Set(roles)];
    this.userRolesSubject.next(assignedRoles);

    if (!assignedRoles.includes(this.activeRoleSubject.value)) {
      this.activeRoleSubject.next(assignedRoles[0] ?? 'Member');
    }
  }

  setMemberRoles(memberId: number, roles: UserRole[]): void {
    const assignedRoles: UserRole[] = roles.length
      ? [...new Set(roles)]
      : ['Member'];
    const generation = this.identityGeneration;
    this.roleUpdateErrorSubject.next('');
    this.http
      .put<{ roles: UserRole[] }>(`${this.apiUrl}/admin/users/${memberId}/roles`, {
        roles: assignedRoles
      })
      .subscribe({
        next: (saved) => {
          if (generation !== this.identityGeneration) return;
          this.communityMembersSubject.next(this.communityMembersSubject.value.map(member =>
            member.id === memberId ? { ...member, roles: saved.roles } : member));
          if (memberId === this.currentUserId) this.setUserRoles(saved.roles);
        },
        error: () => {
          if (generation === this.identityGeneration) this.roleUpdateErrorSubject.next('Permissions were not saved. Refresh and check your access before trying again.');
        }
      });
  }

  setCurrentUserName(fullName: string): void {
    this.communityMembersSubject.next(
      this.communityMembersSubject.value.map((member) =>
        member.isCurrentUser ? { ...member, fullName } : member
      )
    );
  }

  clearUser(): void {
    this.identityGeneration++;
    this.currentUserId = 0;
    this.userRolesSubject.next([]);
    this.activeRoleSubject.next('Member');
    this.communityMembersSubject.next([]);
    this.roleUpdateErrorSubject.next('');
  }

  private activeRoleKey(userId: number): string {
    return `duranki_active_role_${userId}`;
  }

}
