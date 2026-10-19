import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RoleService, UserRole } from './core/services/role.service';
import { AuthService } from './auth.service';
import { catchError, map, of } from 'rxjs';

export const roleGuard: CanActivateFn = (route) => {
  const roles = inject(RoleService);
  const router = inject(Router);
  const requiredRoles = (route.data['roles'] ?? [route.data['role']]) as UserRole[];
  const auth = inject(AuthService);
  const token = auth.getToken();

  if (!token) { roles.clearUser(); return router.createUrlTree(['/login']); }
  return auth.getProfile().pipe(map(user => {
    if (auth.getToken() !== token) return router.createUrlTree(['/login']);
    roles.initializeUser(user.id, user.roles, `${user.firstName} ${user.lastName}`);
    const assignedRole = requiredRoles.find(role => roles.canAccessRole(role));
    if (assignedRole) { roles.setActiveRole(assignedRole); return true; }
    return router.createUrlTree([roles.canAccessRole('Member') ? '/dashboard/member' : '/login']);
  }), catchError(() => {
    if (auth.getToken() === token) roles.clearUser();
    return of(router.createUrlTree(['/login']));
  }));
};
