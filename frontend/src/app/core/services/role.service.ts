import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export type UserRole =
  | 'Member'
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

const ROLE_ROUTES: Record<UserRole, string> = {
  Member: '/dashboard/member',
  Pastor: '/dashboard/pastor',
  Bishop: '/dashboard/bishop',
  'Admin User': '/dashboard/admin-user',
  'KZNCC User': '/dashboard/kzncc-user',
  'KZNCC Admin': '/dashboard/kzncc-admin',
  'Service Provider Admin': '/dashboard/service-provider-admin',
  'Service Provider User': '/dashboard/service-provider-user'
};

const ROLE_MENUS: Record<UserRole, RoleMenuItem[]> = {
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
    { label: 'KZNCC communication', description: 'Open announcements, messages and events.', route: '/kzncc' },
    { label: 'Council events', description: 'View upcoming KZNCC events.', route: '/kzncc' },
    { label: 'Member information', description: 'Read KZNCC member updates.', route: '/kzncc' }
  ],
  'KZNCC Admin': [
    { label: 'Publish announcements', description: 'Create official KZNCC announcements.' },
    { label: 'Manage events', description: 'Create and update council events.' },
    { label: 'Member communication', description: 'Send messages to KZNCC members.' }
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
  private readonly roleAssignmentsStorageKey = 'duranki_role_assignments';
  private currentUserId = this.readCurrentUserId();
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
  private readonly defaultAssignments: Record<number, UserRole[]> = {
    1: ['Member'],
    2: ['Member', 'Pastor'],
    3: ['Member', 'Bishop'],
    4: ['Member', 'KZNCC User'],
    5: ['Member', 'KZNCC Admin'],
    6: ['Admin User'],
    7: ['Service Provider Admin'],
    8: ['Service Provider User']
  };
  private readonly userRolesSubject = new BehaviorSubject<UserRole[]>(
    this.rolesForUser(this.currentUserId)
  );
  private readonly activeRoleSubject = new BehaviorSubject<UserRole>(
    this.readStoredRole()
  );
  private readonly communityMembersSubject =
    new BehaviorSubject<CommunityMemberRoleAssignment[]>([
      {
        id: 1,
        fullName: 'Jeremy Shabalala',
        telephoneNumber: '071 234 5678',
        roles: this.rolesForUser(1)
      },
      {
        id: 2,
        fullName: 'Nandi Mthembu',
        telephoneNumber: '072 555 0184',
        roles: this.rolesForUser(2)
      },
      {
        id: 3,
        fullName: 'Thabo Khumalo',
        telephoneNumber: '073 661 4209',
        roles: this.rolesForUser(3)
      },
      {
        id: 4,
        fullName: 'Lerato Sithole',
        telephoneNumber: '078 944 1132',
        roles: this.rolesForUser(4)
      },
      {
        id: 5,
        fullName: 'Ayanda Dlamini',
        telephoneNumber: '074 100 2003',
        roles: this.rolesForUser(5)
      },
      {
        id: 6,
        fullName: 'Sipho Ncube',
        telephoneNumber: '076 300 4005',
        roles: this.rolesForUser(6)
      },
      {
        id: 7,
        fullName: 'Zanele Mkhize',
        telephoneNumber: '079 500 6007',
        roles: this.rolesForUser(7)
      },
      {
        id: 8,
        fullName: 'Mandla Cele',
        telephoneNumber: '081 700 8009',
        roles: this.rolesForUser(8)
      }
    ].map((member) => ({
      ...member,
      isCurrentUser: member.id === this.currentUserId
    })));

  readonly activeRole$: Observable<UserRole> = this.activeRoleSubject.asObservable();

  getUserRoles(): Observable<UserRole[]> {
    return this.userRolesSubject.asObservable();
  }

  getCommunityMembers(): Observable<CommunityMemberRoleAssignment[]> {
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
        next: (members) =>
          this.communityMembersSubject.next(
            members.map((member) => ({
              ...member,
              isCurrentUser: member.id === this.currentUserId
            }))
          )
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

  getActiveRole(): UserRole {
    return this.activeRoleSubject.value;
  }

  initializeUser(
    userId: number,
    defaultRoles: UserRole[],
    fullName?: string
  ): void {
    this.currentUserId = userId;
    localStorage.setItem(this.currentUserStorageKey, String(userId));
    const assignments = this.readRoleAssignments();
    const assignedRoles: UserRole[] = defaultRoles.length
      ? defaultRoles
      : ['Member'];
    assignments[userId] = assignedRoles;
    this.writeRoleAssignments(assignments);
    this.userRolesSubject.next(assignedRoles);
    this.communityMembersSubject.next(
      this.communityMembersSubject.value.map((member) => ({
        ...member,
        fullName: member.id === userId && fullName ? fullName : member.fullName,
        isCurrentUser: member.id === userId,
        roles: assignments[member.id] ?? member.roles
      }))
    );
    const storedRole = localStorage.getItem(this.activeRoleKey(userId));
    const activeRole =
      storedRole && assignedRoles.includes(storedRole as UserRole)
        ? (storedRole as UserRole)
        : assignedRoles[0];
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
    const assignedRoles: UserRole[] = roles.length
      ? [...new Set(roles)]
      : ['Member'];
    this.userRolesSubject.next(assignedRoles);

    if (typeof localStorage !== 'undefined') {
      const assignments = this.readRoleAssignments();
      assignments[this.currentUserId] = assignedRoles;
      this.writeRoleAssignments(assignments);
    }

    if (!assignedRoles.includes(this.activeRoleSubject.value)) {
      this.setActiveRole(assignedRoles[0]);
    }
  }

  setMemberRoles(memberId: number, roles: UserRole[]): void {
    const assignedRoles: UserRole[] = roles.length
      ? [...new Set(roles)]
      : ['Member'];
    const members: CommunityMemberRoleAssignment[] =
      this.communityMembersSubject.value.map((member) =>
      member.id === memberId ? { ...member, roles: assignedRoles } : member
    );
    const updatedMember = members.find((member) => member.id === memberId);

    this.communityMembersSubject.next(members);
    const assignments = this.readRoleAssignments();
    assignments[memberId] = assignedRoles;
    this.writeRoleAssignments(assignments);
    this.http
      .put(`${this.apiUrl}/admin/users/${memberId}/roles`, {
        roles: assignedRoles
      })
      .subscribe({
        error: () => {
          this.communityMembersSubject.next(
            this.communityMembersSubject.value.map((member) =>
              member.id === memberId ? { ...member, roles: member.roles } : member
            )
          );
        }
      });

    if (updatedMember?.isCurrentUser) {
      this.setUserRoles(updatedMember.roles);
    }
  }

  setCurrentUserName(fullName: string): void {
    this.communityMembersSubject.next(
      this.communityMembersSubject.value.map((member) =>
        member.isCurrentUser ? { ...member, fullName } : member
      )
    );
  }

  private readStoredRole(): UserRole {
    if (typeof localStorage === 'undefined') {
      return 'Member';
    }

    const storedRole = localStorage.getItem(this.activeRoleKey(this.currentUserId));
    return this.canAccessStoredRole(storedRole) ? storedRole : 'Member';
  }

  private canAccessStoredRole(role: string | null): role is UserRole {
    return role !== null && this.userRolesSubject.value.includes(role as UserRole);
  }

  private rolesForUser(userId: number): UserRole[] {
    return (
      this.readRoleAssignments()[userId] ??
      this.defaultAssignments[userId] ??
      ['Member']
    );
  }

  private readCurrentUserId(): number {
    return Number(localStorage.getItem(this.currentUserStorageKey) || 1);
  }

  private activeRoleKey(userId: number): string {
    return `duranki_active_role_${userId}`;
  }

  private readRoleAssignments(): Record<number, UserRole[]> {
    try {
      const stored = JSON.parse(
        localStorage.getItem(this.roleAssignmentsStorageKey) ?? '{}'
      ) as Record<number, UserRole[]>;
      return stored && typeof stored === 'object' ? stored : {};
    } catch {
      return {};
    }
  }

  private writeRoleAssignments(assignments: Record<number, UserRole[]>): void {
    localStorage.setItem(
      this.roleAssignmentsStorageKey,
      JSON.stringify(assignments)
    );
  }
}
