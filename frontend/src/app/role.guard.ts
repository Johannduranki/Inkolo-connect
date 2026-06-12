import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RoleService, UserRole } from './core/services/role.service';

export const roleGuard: CanActivateFn = (route) => {
  const roles = inject(RoleService);
  const router = inject(Router);
  const requiredRole = route.data['role'] as UserRole;

  if (roles.canAccessRole(requiredRole)) {
    roles.setActiveRole(requiredRole);
    return true;
  }

  return router.createUrlTree([
    roles.getDashboardRouteForRole(roles.getActiveRole())
  ]);
};
