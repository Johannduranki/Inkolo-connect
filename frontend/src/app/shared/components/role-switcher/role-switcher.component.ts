import { Component, Input, OnInit, OnDestroy, inject, signal } from '@angular/core';
import {TranslatePipe} from '../../../language.component';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../auth.service';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { RoleService } from '../../../core/services/role.service';

@Component({
  selector: 'app-role-switcher',
  standalone: true,
  imports: [AsyncPipe, FormsModule,TranslatePipe],
  templateUrl: './role-switcher.component.html',
  styleUrl: './role-switcher.component.css'
})
export class RoleSwitcherComponent implements OnInit, OnDestroy {
  private readonly roles = inject(RoleService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private communityRequest?: Subscription;
  readonly communities = signal<{memberCommunityId:string; name:string; tenantName:string}[]>([]);
  readonly communityError = signal('');
  readonly selectedCommunity = new URLSearchParams(location.search).get('communityId') ?? '';

  ngOnInit(): void {
    const token = this.auth.getToken();
    this.communityRequest = this.http.get<{communities: {joined:boolean; memberCommunityId:string; name:string; tenantName:string}[]}>('/api/community-registration').subscribe({
      next: result => {
        if (token === this.auth.getToken()) this.communities.set(result.communities.filter(row => row.joined));
      },
      error: () => { if (token === this.auth.getToken()) this.communityError.set('Community choices are unavailable.'); }
    });
  }
  switchCommunity(id: string): void {
    if (this.communities().length < 2) return;
    if (this.communities().some(row => row.memberCommunityId === id) && this.roles.setActiveRole('Member')) {
      window.location.assign('/dashboard/member?communityId=' + encodeURIComponent(id));
    }
  }
  ngOnDestroy(): void { this.communityRequest?.unsubscribe(); this.communities.set([]); }

  @Input({ required: true }) userFullName = '';

  readonly availableRoles$ = this.roles.getUserRoles();
  readonly activeRole$ = this.roles.activeRole$;

  switchRole(event: Event): void {
    const role = (event.target as HTMLSelectElement).value;

    if (role.startsWith('__community:')) {
      if (this.roles.setActiveRole('Member')) {
        window.location.assign(`/community?communityId=${encodeURIComponent(role.slice('__community:'.length))}`);
      }
      return;
    }

    if (!this.roles.setActiveRole(role)) {
      return;
    }

    window.location.assign(this.roles.getDashboardRouteForRole(role));
  }
}
