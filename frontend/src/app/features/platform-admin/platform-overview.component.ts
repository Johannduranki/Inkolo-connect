import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, forkJoin } from 'rxjs';
import { AuthService } from '../../auth.service';
import { RoleSwitcherComponent } from '../../shared/components/role-switcher/role-switcher.component';

interface DirectoryEntry { id: string; name: string; kind?: string; tenantId?: string; }

@Component({
  standalone: true,
  imports: [RoleSwitcherComponent],
  templateUrl: './platform-overview.component.html',
  styleUrl: './platform-overview.component.css'
})
export class PlatformOverviewComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private request?: Subscription;
  private revision = 0;
  readonly name = signal('');
  readonly tenants = signal<DirectoryEntry[]>([]);
  readonly communities = signal<DirectoryEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly areas = [
    { name: 'Users and permissions', url: '/dashboard/users' },
    { name: 'Tenant administration', url: '/dashboard/tenant' },
    { name: 'Community reports', url: '/dashboard/community-reports' },
    { name: 'Tenant and community logos', url: '/dashboard/branding' },
    { name: 'Service pricing', url: '/dashboard/service-pricing' },
    { name: 'Wholesaler Orders', url: '/dashboard/wholesaler-orders?admin=1' },
    { name: 'Treasury', url: '/dashboard/treasury' },
    { name: 'Accounting', url: '/dashboard/accounting' },
    { name: 'Cycle Pay', url: '/dashboard/cycle' },
    { name: 'Training and grants', url: '/dashboard/trader-training' },
    { name: 'Heritage', url: '/dashboard/heritage' }
  ];

  ngOnInit(): void { this.load(); }

  load(): void {
    this.request?.unsubscribe();
    const revision = ++this.revision, token = this.auth.getToken();
    this.tenants.set([]); this.communities.set([]); this.name.set('');
    this.loading.set(true); this.error.set('');
    this.request = forkJoin({
      user: this.auth.getProfile(),
      tenants: this.http.get<DirectoryEntry[]>('/api/tenant-access'),
      branding: this.http.get<DirectoryEntry[]>('/api/branding')
    }).subscribe({
      next: result => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.name.set(result.user.firstName + ' ' + result.user.lastName);
        this.tenants.set(result.tenants);
        this.communities.set(result.branding.filter(row => row.kind === 'community' && result.tenants.some(tenant => tenant.id === row.tenantId)));
        this.loading.set(false);
      },
      error: () => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.loading.set(false);
        this.error.set('The platform directory could not be loaded. Please refresh or sign in again.');
      }
    });
  }

  tenantUrl(id: string): string { return '/dashboard/tenant?tenantId=' + encodeURIComponent(id); }
  communityUrl(id: string): string { return '/dashboard/community-reports?communityId=' + encodeURIComponent(id); }
  logout(): void { this.ngOnDestroy(); this.auth.logout(); window.location.assign('/login'); }
  ngOnDestroy(): void {
    this.revision++; this.request?.unsubscribe();
    this.tenants.set([]); this.communities.set([]); this.name.set('');
  }
}
