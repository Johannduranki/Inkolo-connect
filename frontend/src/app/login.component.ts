import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleService, UserRole } from './core/services/role.service';

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
  readonly password = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(1024)] });
  readonly errorMessage = signal('');
  readonly mode = signal<'login' | 'register'>('login');
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
      (this.mode() === 'register' && (this.firstName.invalid || this.lastName.invalid || this.password.value.length < 15)) ||
      this.password.invalid ||
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
          this.lastName.value.trim(),
          this.password.value
        )
      : this.auth.login(
          this.telephoneNumber.value,
          this.firstName.value.trim(),
          this.lastName.value.trim(),
          this.password.value
        );

    request
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ user, mfaRequired }) => {
          if (mfaRequired) { window.location.assign('/two-factor'); return; }
          this.completeLogin(user);
        },
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
    if (user.roles.includes('Platform Admin')) this.roles.setActiveRole('Platform Admin');
    const activeRole = this.roles.getActiveRole();
    if (activeRole !== 'Member') {
      window.location.assign(this.roles.getDashboardRouteForRole(activeRole));
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
