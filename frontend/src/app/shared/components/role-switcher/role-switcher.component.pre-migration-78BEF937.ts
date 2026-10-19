import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { RoleService } from '../../../core/services/role.service';
import { AuthService } from '../../../auth.service';
import { MemberCommunityService } from '../../../core/services/member-community.service';
import { MemberCommunity } from '../../../core/models/member-community.model';

@Component({
  selector: 'app-role-switcher',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './role-switcher.component.html',
  styleUrl: './role-switcher.component.css'
})
export class RoleSwitcherComponent implements OnInit {
  private readonly roles = inject(RoleService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly communities = inject(MemberCommunityService);

  @Input({ required: true }) userFullName = '';

  readonly availableRoles$ = this.roles.getUserRoles();
  readonly activeRole$ = this.roles.activeRole$;
  readonly hasCommunityAccess = signal(false);
  readonly hasVumaServiceAccess = signal(false);
  readonly memberCommunities = signal<MemberCommunity[]>([]);

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (user) => {
        this.hasVumaServiceAccess.set(user.email?.toLowerCase().includes('vuma') ?? false);
        this.communities.getMemberCommunities().subscribe({
          next: (communities) => {
            this.memberCommunities.set(communities);
            this.hasCommunityAccess.set(communities.length > 0);
          },
          error: () => {
            this.memberCommunities.set([]);
            this.hasCommunityAccess.set(false);
          }
        });
      },
      error: () => {
        this.memberCommunities.set([]);
        this.hasCommunityAccess.set(false);
      }
    });
  }

  switchRole(event: Event): void {
    const role = (event.target as HTMLSelectElement).value;

    if (role === '__member-services') {
      this.roles.setActiveRole('Member');
      void this.router.navigate(['/community']);
      return;
    }

    if (role.startsWith('__community:')) {
      const communityId = role.replace('__community:', '');
      this.roles.setActiveRole('Member');
      void this.router.navigate(['/community'], {
        queryParams: { communityId }
      });
      return;
    }

    if (role === 'Member' && this.hasCommunityAccess()) {
      const firstCommunity = this.memberCommunities()[0];
      this.roles.setActiveRole('Member');
      void this.router.navigate(['/community'], {
        queryParams: firstCommunity ? { communityId: firstCommunity.churchId } : undefined
      });
      return;
    }

    if (!this.roles.setActiveRole(role)) {
      return;
    }

    void this.router.navigate([this.roles.getDashboardRouteForRole(role)]);
  }

  selectedDestination(activeRole: string | null): string {
    if (this.hasCommunityAccess() && this.router.url.startsWith('/community')) {
      const activeCommunity = this.memberCommunities().find(({ churchId }) =>
        this.router.url.includes(`communityId=${encodeURIComponent(churchId)}`) ||
        this.router.url.includes(`communityId=${churchId}`)
      );
      return `__community:${activeCommunity?.churchId ?? this.memberCommunities()[0]?.churchId ?? ''}`;
    }
    if (!this.hasCommunityAccess() && this.router.url.startsWith('/community')) {
      return '__member-services';
    }
    return activeRole ?? '';
  }

  showSwitcher(availableRoles: string[]): boolean {
    return this.hasCommunityAccess() || this.canShowMemberServices(availableRoles) || availableRoles.length > 0;
  }

  canShowMemberServices(availableRoles: string[]): boolean {
    return (
      !this.hasCommunityAccess() &&
      (availableRoles.includes('Member') || availableRoles.includes('Platform Admin'))
    );
  }

  roleLabel(role: string): string {
    if (role === 'Platform Admin') {
      return 'Duranki Platform';
    }
    if (role === 'Service Provider Admin' && this.hasVumaServiceAccess()) {
      return 'Vuma Force Dashboard';
    }
    return role === 'Member' && this.hasCommunityAccess()
      ? 'Member Services'
      : role;
  }

  communityLabel(community: MemberCommunity): string {
    const name = community.branchName
      ? `${community.churchName} - ${community.branchName}`
      : community.churchName;
    return `Member - ${name}`;
  }
}
