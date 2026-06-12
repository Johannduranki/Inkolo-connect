import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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

@Component({
  selector: 'app-admin-user-dashboard',
  standalone: true,
  imports: [RoleSwitcherComponent, DatePipe],
  templateUrl: './admin-user-dashboard.component.html',
  styleUrl: './admin-user-dashboard.component.css'
})
export class AdminUserDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly roles = inject(RoleService);
  private readonly router = inject(Router);
  private readonly agreementsService = inject(LegalAgreementService);

  readonly user = signal<User | null>(null);
  readonly members = signal<CommunityMemberRoleAssignment[]>([]);
  readonly selectedMemberId = signal(1);
  readonly agreements = signal<LegalAgreementEvidence[]>([]);
  readonly allRoles = this.roles.allRoles;

  readonly selectedMember = () =>
    this.members().find((member) => member.id === this.selectedMemberId()) ??
    null;

  ngOnInit(): void {
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
