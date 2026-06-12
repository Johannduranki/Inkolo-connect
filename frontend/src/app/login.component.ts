import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleService, UserRole } from './core/services/role.service';

interface DemoLoginUser {
  id: number;
  firstName: string;
  lastName: string;
  telephoneNumber: string;
  description: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly roles = inject(RoleService);

  readonly firstName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z\s'-]{1,99}$/)]
  });
  readonly lastName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z\s'-]{1,99}$/)]
  });
  readonly telephoneNumber = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^[+\d\s()-]{9,24}$/)]
  });
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly mode = signal<'login' | 'register'>('login');
  readonly demoUsers: DemoLoginUser[] = [
    { id: 1, firstName: 'Jeremy', lastName: 'Shabalala', telephoneNumber: '0712345678', description: 'Member' },
    { id: 2, firstName: 'Nandi', lastName: 'Mthembu', telephoneNumber: '0725550184', description: 'Member + Pastor' },
    { id: 3, firstName: 'Thabo', lastName: 'Khumalo', telephoneNumber: '0736614209', description: 'Member + Bishop' },
    { id: 4, firstName: 'Lerato', lastName: 'Sithole', telephoneNumber: '0789441132', description: 'Member + KZNCC User' },
    { id: 5, firstName: 'Ayanda', lastName: 'Dlamini', telephoneNumber: '0741002003', description: 'Member + KZNCC Admin' },
    { id: 6, firstName: 'Sipho', lastName: 'Ncube', telephoneNumber: '0763004005', description: 'Duranki Admin User' },
    { id: 7, firstName: 'Zanele', lastName: 'Mkhize', telephoneNumber: '0795006007', description: 'Service Provider Admin' },
    { id: 8, firstName: 'Mandla', lastName: 'Cele', telephoneNumber: '0817008009', description: 'Service Provider User' }
  ];

  chooseDemoUser(user: DemoLoginUser): void {
    this.mode.set('login');
    this.firstName.setValue(user.firstName);
    this.lastName.setValue(user.lastName);
    this.telephoneNumber.setValue(user.telephoneNumber);
    this.errorMessage.set('');
  }

  setMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.errorMessage.set('');
    this.firstName.markAsUntouched();
    this.lastName.markAsUntouched();
    this.telephoneNumber.markAsUntouched();
    if (mode === 'register') {
      this.firstName.setValue('');
      this.lastName.setValue('');
      this.telephoneNumber.setValue('');
    }
  }

  submit(): void {
    this.errorMessage.set('');
    this.firstName.markAsTouched();
    this.lastName.markAsTouched();
    this.telephoneNumber.markAsTouched();

    if (
      this.firstName.invalid ||
      this.lastName.invalid ||
      this.telephoneNumber.invalid ||
      this.loading()
    ) {
      return;
    }

    this.loading.set(true);
    const request = this.mode() === 'register'
      ? this.auth.register(
          this.telephoneNumber.value,
          this.firstName.value.trim(),
          this.lastName.value.trim()
        )
      : this.auth.login(
          this.telephoneNumber.value,
          this.firstName.value.trim(),
          this.lastName.value.trim()
        );

    request
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ user }) => this.completeLogin(user),
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            error.error?.message || 'We could not sign you in. Please try again.'
          );
        }
      });
  }

  private completeLogin(user: {
    id: number;
    firstName: string;
    lastName: string;
    roles: UserRole[];
  }): void {
    this.roles.initializeUser(
      user.id,
      user.roles,
      `${user.firstName} ${user.lastName}`
    );
    const activeRole = this.roles.getActiveRole();
    if (activeRole !== 'Member') {
      void this.router.navigate([
        this.roles.getDashboardRouteForRole(activeRole)
      ]);
      return;
    }

    this.auth.getSubscriptions().subscribe({
      next: (subscriptions) => {
        const hasCommunity = subscriptions.some(
          ({ serviceCode, status }) =>
            serviceCode === 'community' && status === 'active'
        );
        void this.router.navigate([
          hasCommunity ? '/community' : '/dashboard/member'
        ]);
      },
      error: () => void this.router.navigate(['/dashboard/member'])
    });
  }
}
