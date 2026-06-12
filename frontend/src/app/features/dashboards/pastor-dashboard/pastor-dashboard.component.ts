import { Component } from '@angular/core';
import { RoleDashboardShellComponent } from '../../../shared/components/role-dashboard-shell/role-dashboard-shell.component';

@Component({
  selector: 'app-pastor-dashboard',
  standalone: true,
  imports: [RoleDashboardShellComponent],
  templateUrl: './pastor-dashboard.component.html',
  styleUrl: './pastor-dashboard.component.css'
})
export class PastorDashboardComponent {}
