import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly brandFaces = Array.from({ length: 16 }, (_, index) => index + 1);
  readonly existingAccount = signal(false);
  private lookupVersion = 0;

  constructor() {
    this.telephoneNumber.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.lookupVersion++;
      this.existingAccount.set(false);
    });
  }

  checkExistingAccount(): void {
    if (this.mode() !== 'register' || this.telephoneNumber.invalid) return;
    const version = ++this.lookupVersion;
    this.http.post<{ registered: boolean }>('/api/auth/registration-check', { telephoneNumber: this.telephoneNumber.value })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => { if (version === this.lookupVersion && this.mode() === 'register') this.existingAccount.set(result.registered); },
        error: () => { /* Registration still performs the authoritative duplicate check. */ }
      });
  }
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
    this.lookupVersion++;
    this.existingAccount.set(false);
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
      (this.mode() === 'register' && !this.existingAccount() && (this.firstName.invalid || this.lastName.invalid || this.password.value.length < 15)) ||
      this.password.invalid ||
      this.telephoneNumber.invalid ||
      this.loading()
    ) {
      return;
    }

    this.loading.set(true);
    const joiningCommunity = (this.mode() === 'register' && this.existingAccount()) || sessionStorage.getItem('duranki_join_after_login') === 'true';
    const request = this.mode() === 'register' && !joiningCommunity
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
          if (joiningCommunity) {
            sessionStorage.setItem('duranki_join_after_login', 'true');
            sessionStorage.removeItem('duranki_login_landing_pending');
          }
          if (mfaRequired) { window.location.assign('/two-factor'); return; }
          if (joiningCommunity) { window.location.assign('/join-community'); return; }
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
