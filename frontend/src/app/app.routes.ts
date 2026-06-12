import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { LoginComponent } from './login.component';
import { CommunityComponent } from './community.component';
import { KznccDashboardComponent } from './features/kzncc/kzncc-dashboard/kzncc-dashboard.component';
import { roleGuard } from './role.guard';
import { MemberDashboardComponent } from './features/dashboards/member-dashboard/member-dashboard.component';
import { PastorDashboardComponent } from './features/dashboards/pastor-dashboard/pastor-dashboard.component';
import { BishopDashboardComponent } from './features/dashboards/bishop-dashboard/bishop-dashboard.component';
import { AdminUserDashboardComponent } from './features/dashboards/admin-user-dashboard/admin-user-dashboard.component';
import { KznccUserDashboardComponent } from './features/dashboards/kzncc-user-dashboard/kzncc-user-dashboard.component';
import { KznccAdminDashboardComponent } from './features/dashboards/kzncc-admin-dashboard/kzncc-admin-dashboard.component';
import { ServiceProviderDashboardComponent } from './features/service-provider/service-provider-dashboard/service-provider-dashboard.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard/member',
    component: MemberDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'Member' }
  },
  {
    path: 'dashboard/pastor',
    component: PastorDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'Pastor' }
  },
  {
    path: 'dashboard/bishop',
    component: BishopDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'Bishop' }
  },
  {
    path: 'dashboard/admin-user',
    component: AdminUserDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'Admin User' }
  },
  {
    path: 'dashboard/kzncc-user',
    component: KznccUserDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'KZNCC User' }
  },
  {
    path: 'dashboard/kzncc-admin',
    component: KznccAdminDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'KZNCC Admin' }
  },
  {
    path: 'dashboard/service-provider-admin',
    component: ServiceProviderDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'Service Provider Admin' }
  },
  {
    path: 'dashboard/service-provider-user',
    component: ServiceProviderDashboardComponent,
    canActivate: [authGuard, roleGuard],
    data: { role: 'Service Provider User' }
  },
  { path: 'dashboard', pathMatch: 'full', redirectTo: 'dashboard/member' },
  { path: 'community', component: CommunityComponent, canActivate: [authGuard] },
  { path: 'kzncc', component: KznccDashboardComponent, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' }
];
