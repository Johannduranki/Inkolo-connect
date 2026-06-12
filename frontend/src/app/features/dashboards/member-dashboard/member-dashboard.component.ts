import { Component } from '@angular/core';
import { DashboardComponent } from '../../../dashboard.component';

@Component({
  selector: 'app-member-dashboard',
  standalone: true,
  imports: [DashboardComponent],
  templateUrl: './member-dashboard.component.html',
  styleUrl: './member-dashboard.component.css'
})
export class MemberDashboardComponent {}
