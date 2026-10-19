import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { recognize } from 'tesseract.js';
import { AuthService, ExistingCommunityRegistration, User } from './auth.service';
import { RoleService, UserRole } from './core/services/role.service';
import { MemberCommunityService } from './core/services/member-community.service';

interface OcrProgressMessage {
  status?: string;
  progress?: number;
}

interface CommunityRegistrationOption {
  id: string;
  name: string;
  tenantName?: string;
}

const defaultPlatformCommunityOptions: CommunityRegistrationOption[] = [
  { id: 'community-inkolo-kzn', name: 'Inkolo KZN Community', tenantName: 'Inkolo' },
  { id: 'community-inkolo-gauteng', name: 'Inkolo Gauteng Community', tenantName: 'Inkolo' },
  { id: 'community-asmara', name: 'Asmara Community', tenantName: 'Evolve' },
  { id: 'community-eritrea', name: 'Eritrea Community', tenantName: 'Evolve' },
  { id: 'community-ilembe-traders', name: 'Traders KZN', tenantName: 'Trader Connect' },
  { id: 'community-trader-ethekwini-central', name: 'eThekwini Central Traders', tenantName: 'Trader Connect' },
  { id: 'community-trader-kwamashu', name: 'KwaMashu Traders', tenantName: 'Trader Connect' },
  { id: 'community-trader-umlazi', name: 'Umlazi Traders', tenantName: 'Trader Connect' },
  { id: 'community-trader-pinetown', name: 'Pinetown Traders', tenantName: 'Trader Connect' }
];

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
  private readonly communities = inject(MemberCommunityService);
  private readonly detectedMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth <= 900);

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
  readonly password = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(4)]
  });
  readonly idNumber = new FormControl('', {
    nonNullable: true,
    validators: [Validators.pattern(/^\d{0,13}$/)]
  });
  readonly dateOfBirth = new FormControl('', { nonNullable: true });
  readonly gender = new FormControl('', { nonNullable: true });
  readonly privacyAccepted = new FormControl(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue]
  });
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly registrationNotice = signal('');
  readonly mode = signal<'login' | 'register'>('login');
  readonly isMobileDevice = signal(this.detectedMobile);
  readonly idScanStatus = signal('');
  readonly idScanPreview = signal('');
  readonly idOcrBusy = signal(false);
  readonly identityVerificationMethod = signal<'MANUAL' | 'ID_UPLOAD_PENDING_REVIEW'>('MANUAL');
  readonly privacyPolicyOpen = signal(false);
  readonly activeCommunities = signal<ExistingCommunityRegistration[]>([]);
  readonly availableCommunities = signal<CommunityRegistrationOption[]>([]);
  readonly existingRegistrationUser = signal<User | null>(null);
  readonly selectedAdditionalCommunityId = new FormControl('', { nonNullable: true });

  setMode(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.errorMessage.set('');
    this.registrationNotice.set('');
    this.firstName.markAsUntouched();
    this.lastName.markAsUntouched();
    this.telephoneNumber.markAsUntouched();
    this.password.markAsUntouched();
    if (mode === 'register') {
      this.firstName.setValue('');
      this.lastName.setValue('');
      this.telephoneNumber.setValue('');
      this.password.setValue('');
      this.idNumber.setValue('');
      this.dateOfBirth.setValue('');
      this.gender.setValue('');
      this.privacyAccepted.setValue(false);
      this.privacyAccepted.markAsUntouched();
      this.idScanStatus.set('');
      this.idScanPreview.set('');
      this.idOcrBusy.set(false);
      this.identityVerificationMethod.set('MANUAL');
      this.privacyPolicyOpen.set(false);
      this.activeCommunities.set([]);
      this.availableCommunities.set([]);
      this.existingRegistrationUser.set(null);
      this.selectedAdditionalCommunityId.setValue('');
    }
  }

  openPrivacyPolicy(): void {
    this.privacyPolicyOpen.set(true);
  }

  closePrivacyPolicy(): void {
    this.privacyPolicyOpen.set(false);
  }

  async uploadIdDocument(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    input.value = '';
    this.identityVerificationMethod.set('ID_UPLOAD_PENDING_REVIEW');

    if (!file.type.startsWith('image/')) {
      this.idScanPreview.set('');
      this.idScanStatus.set(
        'PDF upload is saved for verification, but automatic reading currently needs a photo image.'
      );
      return;
    }

    this.idOcrBusy.set(true);
    this.idScanStatus.set(`Reading ${file.name}...`);
    this.readImagePreview(file);

    try {
      const origin = window.location.origin;
      const ocrOptions = {
        workerPath: `${origin}/tesseract/worker.min.js`,
        corePath: `${origin}/tesseract-core`,
        logger: (message: OcrProgressMessage) => {
          if (message.status) {
            const progress = Math.round((message.progress ?? 0) * 100);
            this.idScanStatus.set(
              progress > 0
                ? `Reading ID image: ${message.status} ${progress}%`
                : `Reading ID image: ${message.status}`
            );
          }
        }
      };
      const nameSideCrop = await this.createNameSideCrop(file);
      const [focusedResult, fullResult] = await Promise.all([
        nameSideCrop ? recognize(nameSideCrop, 'eng', ocrOptions) : Promise.resolve(null),
        recognize(file, 'eng', ocrOptions)
      ]);
      const scanned = this.extractIdentityFromText(
        [
          focusedResult?.data.text ?? '',
          fullResult.data.text
        ].join('\n')
      );
      this.applyExtractedIdentity(scanned);
    } catch {
      this.idScanStatus.set(
        'The ID image could not be read clearly. Please type the details from the ID.'
      );
    } finally {
      this.idOcrBusy.set(false);
    }
  }

  private readImagePreview(file: File): void {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      this.idScanPreview.set(String(reader.result || ''));
    });
    reader.addEventListener('error', () => {
      this.idScanPreview.set('');
      this.idScanStatus.set(
        'ID uploaded for review. The preview could not be loaded, so please type the details from the ID.'
      );
    });
    reader.readAsDataURL(file);
  }

  private createNameSideCrop(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.addEventListener('load', () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
          return;
        }

        const sourceWidth = image.naturalWidth * 0.62;
        const sourceHeight = image.naturalHeight * 0.78;
        const sourceY = image.naturalHeight * 0.08;
        canvas.width = 1800;
        canvas.height = Math.round((sourceHeight / sourceWidth) * canvas.width);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.filter = 'grayscale(1) contrast(1.9) brightness(1.08)';
        context.drawImage(
          image,
          0,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
      });

      image.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      });

      image.src = objectUrl;
    });
  }

  private extractIdentityFromText(text: string): {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    dateOfBirth?: string;
    gender?: string;
  } {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/[^A-Za-z0-9\s/-]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const compactText = lines.join(' ');
    const idNumber = compactText.match(/\b\d{13}\b/)?.[0];
    const fromId = idNumber ? this.identityFromSouthAfricanId(idNumber) : {};

    const lastName = this.extractLabelValue(lines, [
      'Surname',
      'Sumame',
      'Surmame',
      'Surnane',
      'Surnarne',
      'Sumarne',
      'Suman',
      'Last name',
      'Van'
    ]);
    const firstName = this.extractLabelValue(lines, [
      'Names',
      'Narnes',
      'Nanes',
      'Namcs',
      'Namas',
      'Forenames',
      'Forename',
      'First names',
      'First name',
      'Voornames',
      'Name'
    ]);

    return {
      firstName,
      lastName,
      idNumber,
      ...fromId
    };
  }

  private extractLabelValue(lines: string[], labels: string[]): string | undefined {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const label of labels) {
        const labelPattern = this.labelPattern(label);
        const sameLine = line.match(labelPattern);
        const sameLineValue = this.cleanNameCandidate(sameLine?.[1] ?? '');
        if (sameLineValue && this.looksLikeNameValue(sameLineValue)) {
          return this.toTitleCase(sameLineValue);
        }

        if (labelPattern.test(line)) {
          const next = lines.slice(index + 1, index + 5).find((candidate) =>
            this.looksLikeNameValue(this.cleanNameCandidate(candidate))
          );
          if (next) {
            return this.toTitleCase(this.cleanNameCandidate(next));
          }
        }
      }
    }
    return undefined;
  }

  private labelPattern(label: string): RegExp {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}\\s*:?\\s*(.*)$`, 'i');
  }

  private cleanNameCandidate(value: string): string {
    let cleaned = value
      .replace(/\b(Surname|Sumame|Surmame|Surnane|Surnarne|Sumarne|Suman|Last name|Forenames|Forename|First names|First name|Names|Narnes|Nanes|Namcs|Namas|Name|Voornames|Van)\b/gi, '')
      .replace(/\b(Male|Female|RSA|Citizen|Citizenship|Signature|Nationality|Identity|Card|Republic|South|Africa)\b/gi, '')
      .replace(/\d+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    cleaned = cleaned
      .replace(/^(REO|RE0|RY|R Y|R\)|R\/|RO|EO)\s+/i, '')
      .replace(/^[A-Z]{1,3}\s+(?=[A-Z][a-z]{2,})/, '');

    return cleaned.trim();
  }

  private looksLikeNameValue(value: string): boolean {
    const cleaned = this.cleanNameCandidate(value);
    return /^[A-Za-z][A-Za-z\s'-]{1,80}$/.test(cleaned) &&
      !/republic|identity|national|citizen|status|signature|country|date|birth|sex|card|rsa/i.test(cleaned);
  }

  private identityFromSouthAfricanId(idNumber: string): {
    dateOfBirth?: string;
    gender?: string;
  } {
    const year = Number(idNumber.slice(0, 2));
    const month = Number(idNumber.slice(2, 4));
    const day = Number(idNumber.slice(4, 6));
    const currentYear = new Date().getFullYear() % 100;
    const fullYear = year > currentYear ? 1900 + year : 2000 + year;
    const date = new Date(fullYear, month - 1, day);
    const validDate =
      date.getFullYear() === fullYear &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;

    return {
      dateOfBirth: validDate
        ? `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : undefined,
      gender: Number(idNumber.charAt(6)) >= 5 ? 'Male' : 'Female'
    };
  }

  private applyExtractedIdentity(scanned: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    dateOfBirth?: string;
    gender?: string;
  }): void {
    if (scanned.firstName) this.firstName.setValue(scanned.firstName);
    if (scanned.lastName) this.lastName.setValue(scanned.lastName);
    if (scanned.idNumber) this.idNumber.setValue(scanned.idNumber);
    if (scanned.dateOfBirth) this.dateOfBirth.setValue(scanned.dateOfBirth);
    if (scanned.gender) this.gender.setValue(scanned.gender);

    this.firstName.updateValueAndValidity();
    this.lastName.updateValueAndValidity();
    this.idNumber.updateValueAndValidity();

    const filledFields = [
      scanned.firstName || scanned.lastName ? 'name' : '',
      scanned.idNumber ? 'ID number' : '',
      scanned.dateOfBirth ? 'date of birth' : '',
      scanned.gender ? 'gender' : ''
    ].filter(Boolean);

    this.idScanStatus.set(
      filledFields.length > 0
        ? `ID read completed. Autofilled ${filledFields.join(', ')}. Please check the details before registering.`
        : 'The ID image was uploaded, but the details could not be read clearly. Please type them manually.'
    );
  }

  private toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
      .trim();
  }

  submit(): void {
    this.errorMessage.set('');
    this.registrationNotice.set('');
    this.telephoneNumber.markAsTouched();
    this.password.markAsTouched();

    if (
      this.telephoneNumber.invalid ||
      this.password.invalid ||
      this.loading()
    ) {
      return;
    }

    if (this.mode() === 'register' && this.existingRegistrationUser()) {
      this.addExistingUserToCommunity();
      return;
    }

    if (this.mode() === 'register') {
      this.loading.set(true);
      this.auth.checkRegistrationStatus(
        this.telephoneNumber.value,
        this.password.value,
        { idNumber: this.idNumber.value.trim() }
      )
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe({
          next: (status) => {
            if (status.registered && status.user) {
              this.existingRegistrationUser.set(status.user);
              this.activeCommunities.set(status.communities);
              this.populateAvailableCommunities(status.communities);
              this.registrationNotice.set(
                'This phone number is already registered. Choose another community to add to this account.'
              );
              return;
            }
            this.createNewMemberAccount();
          },
          error: (error: HttpErrorResponse) => {
            this.errorMessage.set(
              error.error?.message || 'We could not check your registration. Please try again.'
            );
          }
        });
      return;
    }

    this.loading.set(true);
    this.auth.login(
      this.telephoneNumber.value,
      this.password.value
    )
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

  private createNewMemberAccount(): void {
    this.firstName.markAsTouched();
    this.lastName.markAsTouched();
    this.idNumber.markAsTouched();
    this.privacyAccepted.markAsTouched();

    if (
      this.firstName.invalid ||
      this.lastName.invalid ||
      this.idNumber.invalid ||
      this.privacyAccepted.invalid
    ) {
      return;
    }

    this.loading.set(true);
    this.auth.register(
      this.telephoneNumber.value,
      this.firstName.value.trim(),
      this.lastName.value.trim(),
      this.password.value,
      {
        idNumber: this.idNumber.value.trim(),
        dateOfBirth: this.dateOfBirth.value,
        gender: this.gender.value,
        verificationMethod: this.identityVerificationMethod()
      }
    )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ user }) => this.completeLogin(user),
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            error.error?.message || 'We could not create your account. Please try again.'
          );
        }
      });
  }

  private populateAvailableCommunities(existingCommunities: ExistingCommunityRegistration[]): void {
    const existingIds = new Set(existingCommunities.map((community) => community.churchId));
    this.communities.getActiveChurches().subscribe({
      next: (communities) => {
        const options = this.mergeCommunityRegistrationOptions([
          ...communities.map((community) => ({ id: community.id, name: community.name })),
          ...this.platformCommunityOptions()
        ]).filter((community) => !existingIds.has(community.id));
        this.availableCommunities.set(options);
        this.selectedAdditionalCommunityId.setValue(options[0]?.id ?? '');
      },
      error: () => {
        const options = this.mergeCommunityRegistrationOptions(this.platformCommunityOptions())
          .filter((community) => !existingIds.has(community.id));
        this.availableCommunities.set(options);
        this.selectedAdditionalCommunityId.setValue(options[0]?.id ?? '');
      }
    });
  }

  private platformCommunityOptions(): CommunityRegistrationOption[] {
    try {
      const communities = JSON.parse(localStorage.getItem('duranki_platform_communities') || '[]');
      const tenants = JSON.parse(localStorage.getItem('duranki_platform_tenants') || '[]');
      if (!Array.isArray(communities) || communities.length === 0) {
        return defaultPlatformCommunityOptions;
      }
      const tenantNames = new Map(
        Array.isArray(tenants)
          ? tenants.map((tenant) => [String(tenant.id ?? ''), String(tenant.name ?? '')])
          : []
      );
      return communities
        .filter((community) => String(community.status ?? 'Active').toLowerCase() === 'active')
        .map((community) => ({
          id: String(community.id ?? ''),
          name: String(community.name ?? ''),
          tenantName: tenantNames.get(String(community.tenantId ?? '')) || undefined
        }))
        .filter((community) => community.id && community.name);
    } catch {
      return defaultPlatformCommunityOptions;
    }
  }

  private mergeCommunityRegistrationOptions(
    communities: CommunityRegistrationOption[]
  ): CommunityRegistrationOption[] {
    const byId = new Map<string, CommunityRegistrationOption>();
    communities.forEach((community) => {
      if (!community.id || byId.has(community.id)) return;
      byId.set(community.id, community);
    });
    return [...byId.values()].sort((first, second) => {
      const firstLabel = `${first.tenantName ?? ''} ${first.name}`;
      const secondLabel = `${second.tenantName ?? ''} ${second.name}`;
      return firstLabel.localeCompare(secondLabel);
    });
  }

  private addExistingUserToCommunity(): void {
    const selectedCommunityId = this.selectedAdditionalCommunityId.value;
    const user = this.existingRegistrationUser();
    if (!user) return;
    if (!selectedCommunityId) {
      this.errorMessage.set('Choose the community you want to register for.');
      return;
    }

    const selectedCommunity = this.availableCommunities().find(
      (community) => community.id === selectedCommunityId
    );
    this.loading.set(true);
    this.communities.addMemberCommunity(
      selectedCommunityId,
      undefined,
      selectedCommunity?.name
    )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.completeLogin(user),
        error: ({ error }) => {
          this.errorMessage.set(
            error?.message ?? 'The community could not be added to your account.'
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

    if (user.roles.includes('Platform Admin')) {
      void this.router.navigate(['/dashboard/platform-admin']);
      return;
    }

    if (user.roles.includes('Member')) {
      this.communities.getMemberCommunity(String(user.id)).subscribe({
        next: (community) => {
          if (community) {
            this.roles.setActiveRole('Member');
            void this.router.navigate(['/community']);
            return;
          }
          this.roles.setActiveRole('Member');
          void this.router.navigate(['/community'], {
            queryParams: { setup: 'community' }
          });
        },
        error: () => {
          this.roles.setActiveRole('Member');
          void this.router.navigate(['/community'], {
            queryParams: { setup: 'community' }
          });
        }
      });
      return;
    }

    this.navigateToBestDashboard(user.roles);
  }

  private navigateToBestDashboard(roles: UserRole[]): void {
    const activeRole =
      roles.find((role) => role !== 'Member') ?? roles[0] ?? 'Member';
    this.roles.setActiveRole(activeRole);
    void this.router.navigate([
      this.roles.getDashboardRouteForRole(activeRole)
    ]);
  }
}
