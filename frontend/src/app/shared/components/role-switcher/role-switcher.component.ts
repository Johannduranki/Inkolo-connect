import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { RoleService } from '../../../core/services/role.service';

@Component({
  selector: 'app-role-switcher',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './role-switcher.component.html',
  styleUrl: './role-switcher.component.css'
})
export class RoleSwitcherComponent {
  private readonly roles = inject(RoleService);
  private readonly router = inject(Router);

  @Input({ required: true }) userFullName = '';

  readonly availableRoles$ = this.roles.getUserRoles();
  readonly activeRole$ = this.roles.activeRole$;

  switchRole(event: Event): void {
    const role = (event.target as HTMLSelectElement).value;

    if (!this.roles.setActiveRole(role)) {
      return;
    }

    void this.router.navigate([this.roles.getDashboardRouteForRole(role)]);
  }
}
