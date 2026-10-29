import { Component, DestroyRef, inject, signal } from '@angular/core';
import {LanguageComponent,TranslatePipe} from './language.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleService, UserRole } from './core/services/role.service';
import { parseIdentityText } from './identity-ocr';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule,LanguageComponent,TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly brandFaces = Array.from({ length: 16 }, (_, index) => index + 1);
  readonly existingAccount = signal(false);
  readonly idNumber = new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^(?:\d{13})?$/)] });
  readonly dateOfBirth = new FormControl('', { nonNullable: true });
  readonly gender = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] });
  readonly privacyAccepted = new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] });
  readonly privacyPolicyOpen = signal(false);
  readonly privacyPolicyText = signal('');
  readonly idScanStatus = signal('');
  readonly idScanPreview = signal('');
  readonly idOcrBusy = signal(false);
  readonly isMobileDevice = signal(/Android|iPhone|iPad/i.test(navigator.userAgent));
  idDocument: File | null = null;
  private scanVersion = 0;
  private lookupVersion = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearDocument());
    this.telephoneNumber.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.lookupVersion++;
      this.existingAccount.set(false);
    });
  }

  clearDocument(): void {
    this.scanVersion++;
    if (this.idScanPreview()) URL.revokeObjectURL(this.idScanPreview());
    this.idScanPreview.set('');
    this.idDocument = null;
    this.idOcrBusy.set(false);
    this.idScanStatus.set('');
  }

  openPrivacyPolicy(): void {
    this.privacyPolicyOpen.set(true);
    this.privacyPolicyText.set('Loading privacy policy...');
    this.http.get('/duranki-privacy-policy.txt', { responseType: 'text' })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: text => this.privacyPolicyText.set(text),
        error: () => this.privacyPolicyText.set('The privacy policy could not be loaded. Please try again before registering.')
      });
  }

  async uploadIdDocument(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clearDocument();
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.idScanStatus.set('Choose a JPG, PNG or PDF up to 5 MB.');
      return;
    }
    this.idDocument = file;
    if (file.type === 'application/pdf') {
      this.idScanStatus.set('PDF selected. It will be saved when you register. Enter the details below.');
      return;
    }
    this.idScanPreview.set(URL.createObjectURL(file));
    this.idOcrBusy.set(true);
    this.idScanStatus.set('Reading ID on this device...');
    const version = this.scanVersion;
    try {
      // Check the bundled model before allocating the OCR worker. A missing
      // model must offer manual entry rather than leave worker startup pending.
      const model = await fetch('/tesseract-data/eng.traineddata.gz', {
        method: 'HEAD', signal: AbortSignal.timeout(15000)
      });
      if (!model.ok) throw new Error('OCR model is unavailable.');
      if (version !== this.scanVersion) return;
      const module = await import('tesseract.js');
      const { recognize } = module.default ?? module;
      const result = await recognize(file, 'eng', {
        workerPath: window.location.origin + '/tesseract/worker.min.js',
        corePath: window.location.origin + '/tesseract-core',
        langPath: window.location.origin + '/tesseract-data',
        cacheMethod: 'none',
        errorHandler: () => { /* Show the existing safe manual-entry fallback. */ }
      });
      if (version !== this.scanVersion) return;
      const fields = parseIdentityText(result.data.text);
      for (const key of ['firstName','lastName','idNumber','dateOfBirth','gender'] as const) {
        if (fields[key] && !this[key].value) this[key].setValue(fields[key]);
      }
      this.idScanStatus.set(Object.values(fields).some(Boolean)
        ? 'Check all details below. The document will be saved when you register and will need review.'
        : 'No ID details could be read clearly. Enter the details below; your selected document will be saved when you register.');
    } catch {
      if (version === this.scanVersion) this.idScanStatus.set('Automatic reading was unavailable. Enter the details below; your selected document will still be saved on registration.');
    } finally {
      if (version === this.scanVersion) this.idOcrBusy.set(false);
    }
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
      this.clearDocument();
      this.idNumber.reset('');
      this.dateOfBirth.reset('');
      this.gender.reset('');
      this.privacyAccepted.reset(false);
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
    if (this.mode() === 'register' && !this.existingAccount()) {
      this.privacyAccepted.markAsTouched();
      this.idNumber.markAsTouched();
      if (this.privacyAccepted.invalid || this.idNumber.invalid || this.gender.invalid || this.idOcrBusy()) return;
      if (this.password.value.length < 15) { this.errorMessage.set('Use a password of at least 15 characters.'); return; }
    }

    if (
      (this.mode() === 'register' && !this.existingAccount() && (this.firstName.invalid || this.lastName.invalid || this.password.value.length < 15)) ||
      this.password.invalid ||
      this.telephoneNumber.invalid ||
      this.loading()
    ) {
      return;
    }

    this.loading.set(true);
    const joiningCommunity = (this.mode() === 'register' && this.existingAccount()) || (this.mode() === 'login' && sessionStorage.getItem('duranki_join_after_login') === 'true');
    const request = this.mode() === 'register' && !joiningCommunity
      ? this.auth.register(
          this.telephoneNumber.value,
          this.firstName.value.trim(),
          this.lastName.value.trim(),
          this.password.value,
          { idNumber: this.idNumber.value, dateOfBirth: this.dateOfBirth.value, gender: this.gender.value,
            privacyAccepted: this.privacyAccepted.value, idDocument: this.idDocument }
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
          if (error.status === 409 && error.error?.code === 'ACCOUNT_EXISTS') this.existingAccount.set(true);
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
