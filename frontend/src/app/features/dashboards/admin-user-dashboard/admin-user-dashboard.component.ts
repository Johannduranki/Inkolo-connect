import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../../auth.service';
import {
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

interface SubscriptionChartItem extends ServiceSubscriptionCount {
  name: string;
  color: string;
}

@Component({
  selector: 'app-admin-user-dashboard',
  standalone: true,
  imports: [RoleSwitcherComponent, DatePipe, ReactiveFormsModule],
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

  readonly user = signal<User | null>(null);
  readonly members = signal<CommunityMemberRoleAssignment[]>([]);
  readonly selectedMemberId = signal(1);
  readonly agreements = signal<LegalAgreementEvidence[]>([]);
  readonly revenueFormulas = signal<RevenueShareFormula[]>([]);
  readonly analytics = signal<AdminAnalytics | null>(null);
  readonly userNotice = signal('');
  readonly newFirstName = new FormControl('', { nonNullable: true });
  readonly newLastName = new FormControl('', { nonNullable: true });
  readonly newTelephone = new FormControl('', { nonNullable: true });
  readonly newEmail = new FormControl('', { nonNullable: true });
  readonly newRole = new FormControl<UserRole>('Member', { nonNullable: true });
  readonly allRoles = this.roles.allRoles;

  readonly selectedMember = () =>
    this.members().find((member) => member.id === this.selectedMemberId()) ??
    null;

  ngOnInit(): void {
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
        this.loadAgreements(firstMemberId);
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

  selectMember(event: Event): void {
    const memberId = Number((event.target as HTMLSelectElement).value);
    this.selectedMemberId.set(memberId);
    this.loadAgreements(memberId);
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
      'catch-a-ride': 'Catch a Ride',
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
