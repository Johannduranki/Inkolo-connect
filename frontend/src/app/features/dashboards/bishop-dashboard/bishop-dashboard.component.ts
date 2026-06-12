import { Component } from '@angular/core';
import { RoleDashboardShellComponent } from '../../../shared/components/role-dashboard-shell/role-dashboard-shell.component';

@Component({
  selector: 'app-bishop-dashboard',
  standalone: true,
  imports: [RoleDashboardShellComponent],
  templateUrl: './bishop-dashboard.component.html',
  styleUrl: './bishop-dashboard.component.css'
})
export class BishopDashboardComponent {}
