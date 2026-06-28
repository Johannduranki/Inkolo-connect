import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../../auth.service';
import {
  AdminMemberProfile,
  CommunityMemberRoleAssignment,
  RoleService,
  UserRole
} from '../../../core/services/role.service';
import { RoleSwitcherComponent } from '../../../shared/components/role-switcher/role-switcher.component';
import {
  LegalAgreementEvidence,
  LegalAgreementService
} from '../../../core/services/legal-agreement.service';
import {
  RevenueRateField,
  RevenueShareFormula,
  RevenueShareFormulaService
} from '../../../core/services/revenue-share-formula.service';
import {
  AdminAnalytics,
  AdminAnalyticsService,
  ServiceSubscriptionCount
} from '../../../core/services/admin-analytics.service';
import {
  Church,
  CommunityBranding
} from '../../../core/models/member-community.model';
import { MemberCommunityService } from '../../../core/services/member-community.service';
import {
  AdminReportService,
  AdminReportType,
  PaidMemberReport
} from '../../../core/services/admin-report.service';
import { MemberDocument } from '../../service-provider/models/member-document.model';
import { ServiceProviderDocumentService } from '../../service-provider/services/service-provider-document.service';

interface SubscriptionChartItem extends ServiceSubscriptionCount {
  name: string;
  color: string;
}

@Component({
  selector: 'app-admin-user-dashboard',
  standalone: true,
  imports: [RoleSwitcherComponent, DatePipe, CurrencyPipe, ReactiveFormsModule],
  templateUrl: './admin-user-dashboard.component.html',
  styleUrl: './admin-user-dashboard.component.css'
})
export class AdminUserDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly roles = inject(RoleService);
  private readonly router = inject(Router);
  private readonly agreementsService = inject(LegalAgreementService);
  private readonly revenueFormulasService = inject(RevenueShareFormulaService);
  private readonly analyticsService = inject(AdminAnalyticsService);
  private readonly communities = inject(MemberCommunityService);
  private readonly reportsService = inject(AdminReportService);
  private readonly documentsService = inject(ServiceProviderDocumentService);

  readonly user = signal<User | null>(null);
  readonly members = signal<CommunityMemberRoleAssignment[]>([]);
  readonly selectedMemberId = signal(1);
  readonly agreements = signal<LegalAgreementEvidence[]>([]);
  readonly memberProfileOpen = signal(false);
  readonly memberProfileTab = signal<'details' | 'documents'>('details');
  readonly memberProfile = signal<AdminMemberProfile | null>(null);
  readonly memberDocuments = signal<MemberDocument[]>([]);
  readonly memberProfileLoading = signal(false);
  readonly revenueFormulas = signal<RevenueShareFormula[]>([]);
  readonly analytics = signal<AdminAnalytics | null>(null);
  readonly userNotice = signal('');
  readonly churches = signal<Church[]>([]);
  readonly selectedChurchId = new FormControl('', { nonNullable: true });
  readonly communityLogo = signal('');
  readonly communityPrimary = new FormControl('#062d6b', { nonNullable: true });
  readonly communitySecondary = new FormControl('#087ce8', { nonNullable: true });
  readonly communityAccent = new FormControl('#58c91a', { nonNullable: true });
  readonly communityBackground = new FormControl('#f2f8ff', { nonNullable: true });
  readonly brandingNotice = signal('');
  readonly reportOpen = signal(false);
  readonly reportLoading = signal(false);
  readonly reportNotice = signal('');
  readonly generatedReport = signal<PaidMemberReport | null>(null);
  readonly reportType = new FormControl<AdminReportType>('BY_CHURCH', {
    nonNullable: true
  });
  readonly reportMonth = new FormControl(
    new Date().toISOString().slice(0, 7),
    { nonNullable: true }
  );
  readonly reportChurchId = new FormControl('', { nonNullable: true });
  readonly reportServiceCode = new FormControl('', { nonNullable: true });
  readonly newFirstName = new FormControl('', { nonNullable: true });
  readonly newLastName = new FormControl('', { nonNullable: true });
  readonly newTelephone = new FormControl('', { nonNullable: true });
  readonly newEmail = new FormControl('', { nonNullable: true });
  readonly newRole = new FormControl<UserRole>('Member', { nonNullable: true });
  readonly allRoles = this.roles.allRoles;
  readonly reportServices = [
    { code: 'funeral', name: 'Funeral Services' },
    { code: 'kzncc', name: 'KZNCC Membership' },
    { code: 'wallet', name: 'Wallet' },
    { code: 'vas-services', name: 'VAS Services' },
    { code: 'job-search', name: 'Job Search' },
    { code: 'eduu', name: 'EduU' },
    { code: 'vuma-fibre', name: 'Vuma Fibre' },
    { code: 'keycha-properties', name: 'Keytcha Properties' },
    { code: 'catch-a-ride', name: 'Catch a Lift' },
    { code: 'build-up-balance', name: 'Buy and Sell' }
  ];

  readonly selectedMember = () =>
    this.members().find((member) => member.id === this.selectedMemberId()) ??
    null;

  ngOnInit(): void {
    this.communities.getAdminChurches().subscribe((churches) => {
      this.churches.set(churches);
      if (churches[0]) {
        this.selectedChurchId.setValue(churches[0].id);
        this.loadSelectedChurchBranding();
      }
    });
    this.analyticsService
      .getAnalytics()
      .subscribe((analytics) => this.analytics.set(analytics));
    this.revenueFormulasService
      .getFormulas()
      .subscribe((formulas) => this.revenueFormulas.set(formulas));
    this.roles.getCommunityMembers().subscribe((members) => {
      this.members.set(members);
      const firstMemberId = members[0]?.id;
      if (firstMemberId) {
        this.selectedMemberId.set(firstMemberId);
      }
    });
    this.auth.getProfile().subscribe({
      next: (user) => {
        this.user.set(user);
        this.roles.setCurrentUserName(`${user.firstName} ${user.lastName}`);
      },
      error: () => this.logout()
    });
  }

  selectedChurch(): Church | undefined {
    return this.churches().find(({ id }) => id === this.selectedChurchId.value);
  }

  loadSelectedChurchBranding(): void {
    const branding = this.selectedChurch()?.branding;
    this.communityLogo.set(branding?.logoUrl ?? '');
    this.communityPrimary.setValue(branding?.primaryColor ?? '#062d6b');
    this.communitySecondary.setValue(branding?.secondaryColor ?? '#087ce8');
    this.communityAccent.setValue(branding?.accentColor ?? '#58c91a');
    this.communityBackground.setValue(branding?.backgroundColor ?? '#f2f8ff');
    this.brandingNotice.set('');
  }

  chooseCommunityLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const church = this.selectedChurch();
    if (!church) {
      this.brandingNotice.set('Choose a church first.');
      input.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.brandingNotice.set('Choose a PNG, JPG or WEBP community logo.');
      input.value = '';
      return;
    }
    this.brandingNotice.set('Uploading community logo...');
    this.communities.uploadChurchLogo(church.id, file).subscribe({
      next: (updated) => {
        this.churches.update((churches) =>
          churches.map((item) => item.id === updated.id ? updated : item)
        );
        this.communityLogo.set(updated.branding?.logoUrl ?? '');
        this.brandingNotice.set(`${updated.name} logo was uploaded and saved.`);
        input.value = '';
      },
      error: ({ error }) => {
        this.brandingNotice.set(error?.message ?? 'The community logo could not be uploaded.');
        input.value = '';
      }
    });
  }

  saveCommunityBranding(): void {
    const church = this.selectedChurch();
    if (!church) {
      this.brandingNotice.set('Choose a church first.');
      return;
    }
    const branding: CommunityBranding = {
      logoUrl: this.communityLogo(),
      primaryColor: this.communityPrimary.value,
      secondaryColor: this.communitySecondary.value,
      accentColor: this.communityAccent.value,
      backgroundColor: this.communityBackground.value
    };
    this.communities.updateChurchBranding(church.id, branding).subscribe({
      next: (updated) => {
        this.churches.update((churches) =>
          churches.map((item) => item.id === updated.id ? updated : item)
        );
        this.brandingNotice.set(`${updated.name} branding was saved.`);
      },
      error: ({ error }) =>
        this.brandingNotice.set(error?.message ?? 'Community branding could not be saved.')
    });
  }

  resetCommunityBranding(): void {
    this.communityLogo.set('');
    this.communityPrimary.setValue('#062d6b');
    this.communitySecondary.setValue('#087ce8');
    this.communityAccent.setValue('#58c91a');
    this.communityBackground.setValue('#f2f8ff');
    this.brandingNotice.set('Default Inkolo colors restored. Select Save to publish.');
  }

  selectMember(event: Event): void {
    const memberId = Number((event.target as HTMLSelectElement).value);
    this.selectedMemberId.set(memberId);
    this.memberProfileOpen.set(false);
  }

  openMemberProfile(): void {
    const member = this.selectedMember();
    if (!member) return;
    this.memberProfileLoading.set(true);
    this.memberProfileTab.set('details');
    this.memberProfile.set(null);
    this.memberDocuments.set([]);
    this.agreements.set([]);
    this.memberProfileOpen.set(true);
    this.roles.getAdminMemberProfile(member.id).subscribe({
      next: (profile) => {
        this.memberProfile.set(profile);
        this.memberProfileLoading.set(false);
      },
      error: () => {
        this.memberProfileLoading.set(false);
        this.userNotice.set('The member profile could not be loaded.');
      }
    });
    this.documentsService
      .getMemberDocumentsForAdmin(String(member.id))
      .subscribe((documents) => this.memberDocuments.set(documents));
    this.loadAgreements(member.id);
  }

  closeMemberProfile(): void {
    this.memberProfileOpen.set(false);
    this.memberProfile.set(null);
    this.memberDocuments.set([]);
    this.agreements.set([]);
  }

  memberCommunityHeading(): string {
    const community = this.memberProfile()?.community;
    if (!community?.churchName) return 'No community selected';
    return community.branchName
      ? `${community.churchName} - ${community.branchName}`
      : community.churchName;
  }

  viewAgreement(agreement: LegalAgreementEvidence): void {
    this.agreementsService
      .getAgreementDocument(agreement.id)
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      });
  }

  downloadEvidence(agreement: LegalAgreementEvidence): void {
    this.agreementsService
      .getAgreementEvidenceFile(agreement.id)
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${agreement.serviceCode}-acceptance-${agreement.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
  }

  hasRole(member: CommunityMemberRoleAssignment, role: UserRole): boolean {
    return member.roles.includes(role);
  }

  updateRole(role: UserRole, event: Event): void {
    const member = this.selectedMember();

    if (!member) {
      return;
    }

    const checked = (event.target as HTMLInputElement).checked;
    const roles = checked
      ? [...member.roles, role]
      : member.roles.filter((assignedRole) => assignedRole !== role);
    this.roles.setMemberRoles(member.id, roles);
  }

  createUser(): void {
    this.roles.createUser({
      firstName: this.newFirstName.value.trim(),
      lastName: this.newLastName.value.trim(),
      telephoneNumber: this.newTelephone.value.trim(),
      email: this.newEmail.value.trim(),
      roles: [this.newRole.value]
    }).subscribe({
      next: (created) => {
        this.selectedMemberId.set(created.id);
        this.userNotice.set(`${created.fullName} was created.`);
        this.newFirstName.setValue('');
        this.newLastName.setValue('');
        this.newTelephone.setValue('');
        this.newEmail.setValue('');
      },
      error: (error) =>
        this.userNotice.set(error.error?.message ?? 'The user could not be created.')
    });
  }

  removeSelectedUser(): void {
    const member = this.selectedMember();
    if (!member || member.isCurrentUser) {
      this.userNotice.set('You cannot remove your own admin account.');
      return;
    }
    this.roles.removeUser(member.id).subscribe({
      next: () => {
        const next = this.members().find(({ id }) => id !== member.id);
        if (next) this.selectedMemberId.set(next.id);
        this.userNotice.set(`${member.fullName} was removed.`);
      },
      error: (error) =>
        this.userNotice.set(error.error?.message ?? 'The user could not be removed.')
    });
  }

  resetSelectedUserData(): void {
    const member = this.selectedMember();
    if (
      !member ||
      !window.confirm(
        `Permanently reset ${member.fullName}? This deletes all service subscriptions, applications, accepted Terms and Conditions evidence, and documents created or uploaded for this user. Their account, profile, roles and community stay unchanged.`
      )
    ) {
      return;
    }
    this.roles.resetUserServiceData(member.id).subscribe({
      next: (summary) => {
        this.agreements.set([]);
        this.memberDocuments.set([]);
        this.analyticsService
          .getAnalytics()
          .subscribe((analytics) => this.analytics.set(analytics));
        this.userNotice.set(
          `${member.fullName} was reset. Deleted ${summary.subscriptionsDeleted} subscriptions, ${summary.applicationsDeleted} applications, ${summary.agreementsDeleted} accepted documents and ${summary.documentsDeleted} member documents.`
        );
      },
      error: (error) =>
        this.userNotice.set(
          error.error?.message ?? 'The user data could not be reset.'
        )
    });
  }

  openReportBuilder(): void {
    this.reportNotice.set('');
    this.generatedReport.set(null);
    this.reportOpen.set(true);
  }

  createReport(): void {
    this.reportLoading.set(true);
    this.reportNotice.set('');
    this.reportsService
      .createPaidMemberReport({
        reportType: this.reportType.value,
        month: this.reportMonth.value,
        churchId: this.reportChurchId.value,
        serviceCode: this.reportServiceCode.value
      })
      .subscribe({
        next: (report) => {
          this.generatedReport.set(report);
          this.reportLoading.set(false);
          this.reportNotice.set(
            report.rows.length
              ? 'Report created from active paid subscription records.'
              : 'No paid subscription records match these filters.'
          );
        },
        error: (error) => {
          this.reportLoading.set(false);
          this.reportNotice.set(
            error.error?.message ?? 'The report could not be created.'
          );
        }
      });
  }

  downloadReportCsv(): void {
    const report = this.generatedReport();
    if (!report) return;
    const escape = (value: unknown) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = [
      [
        'Member',
        'Telephone',
        'Church',
        'Branch',
        'Service',
        'Plan',
        'Amount',
        'Paid date',
        'Status'
      ].map(escape).join(','),
      ...report.rows.map((row) =>
        [
          row.memberName,
          row.telephoneNumber,
          row.churchName,
          row.branchName,
          row.serviceName,
          row.planLabel,
          (row.amountCents / 100).toFixed(2),
          row.paidAt,
          row.paymentStatus
        ].map(escape).join(',')
      )
    ];
    const blob = new Blob([lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duranki-paid-members-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  updateRevenueRate(
    serviceId: number,
    field: RevenueRateField,
    event: Event
  ): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.revenueFormulasService.updateRate(serviceId, field, value);
  }

  formulaTotal(formula: RevenueShareFormula): number {
    return this.revenueFormulasService.totalRate(formula);
  }

  resetRevenueFormulas(): void {
    this.revenueFormulasService.resetDefaults();
  }

  subscriptionChartItems(): SubscriptionChartItem[] {
    const names: Record<string, string> = {
      'build-up-balance': 'Buy and Sell',
      funeral: 'Funeral Services',
      community: 'My Community',
      referral: 'Referral',
      'job-search': 'Job Search',
      'vas-services': 'VAS Services',
      eduu: 'EduU',
      'vuma-fibre': 'Vuma Fibre',
      'catch-a-ride': 'Catch a Lift',
      kzncc: 'KZNCC',
      'keycha-properties': 'Keytcha Properties',
      wallet: 'Wallet'
    };
    const colors = [
      '#087ce8',
      '#55bd2b',
      '#063f91',
      '#23a7d9',
      '#7b55d9',
      '#15a86b',
      '#ffb21a',
      '#9c3de0',
      '#2b74dc',
      '#72c83b',
      '#0e5ba8',
      '#00a7a7'
    ];
    return (this.analytics()?.subscriptionsByService ?? []).map((item, index) => ({
      ...item,
      name: names[item.serviceCode] ?? item.serviceCode,
      color: colors[index % colors.length]
    }));
  }

  donutBackground(): string {
    const items = this.subscriptionChartItems();
    const total = items.reduce((sum, item) => sum + item.count, 0);
    if (!total) {
      return 'conic-gradient(#dce8f0 0deg 360deg)';
    }
    let start = 0;
    const stops = items.map((item) => {
      const end = start + (item.count / total) * 360;
      const stop = `${item.color} ${start}deg ${end}deg`;
      start = end;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  private loadAgreements(memberId: number): void {
    this.agreementsService
      .getMemberAgreements(memberId)
      .subscribe((agreements) => this.agreements.set(agreements));
  }
}
