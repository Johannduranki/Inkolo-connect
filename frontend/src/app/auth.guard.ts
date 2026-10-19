import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleService } from './core/services/role.service';
import { catchError, map, of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const roles = inject(RoleService);
  const token = auth.getToken();

  if (!token) { roles.clearUser(); return router.createUrlTree(['/login']); }
  return auth.getProfile().pipe(map(user => {
    if (auth.getToken() !== token) return router.createUrlTree(['/login']);
    roles.initializeUser(user.id, user.roles, `${user.firstName} ${user.lastName}`);
    return true;
  }), catchError(() => {
    if (auth.getToken() === token) roles.clearUser();
    return of(router.createUrlTree(['/login']));
  }));
};

