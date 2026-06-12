import { Component } from '@angular/core';
import { RoleDashboardShellComponent } from '../../../shared/components/role-dashboard-shell/role-dashboard-shell.component';

@Component({
  selector: 'app-kzncc-user-dashboard',
  standalone: true,
  imports: [RoleDashboardShellComponent],
  templateUrl: './kzncc-user-dashboard.component.html',
  styleUrl: './kzncc-user-dashboard.component.css'
})
export class KznccUserDashboardComponent {}
