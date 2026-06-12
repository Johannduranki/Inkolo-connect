import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService, User } from '../../../auth.service';
import { KznccWalletSummary, WalletTransaction } from '../../../core/models/wallet.model';
import { WalletService } from '../../../core/services/wallet.service';
import { RoleSwitcherComponent } from '../../../shared/components/role-switcher/role-switcher.component';
import { KznccAdminEvent } from '../../kzncc-admin/models/kzncc-admin-event.model';
import { KznccAdminMessage } from '../../kzncc-admin/models/kzncc-admin-message.model';
import { KznccChurch } from '../../kzncc-admin/models/kzncc-church.model';
import {
  KznccRevenueSummary,
  KznccServiceRevenue
} from '../../kzncc-admin/models/kzncc-service-revenue.model';
import {
  KznccAdminService,
  KznccManagedUser
} from '../../kzncc-admin/services/kzncc-admin.service';
import { KznccCommunicationService } from '../../kzncc-admin/services/kzncc-communication.service';
import { KznccEventService } from '../../kzncc-admin/services/kzncc-event.service';
import { KznccRevenueService } from '../../kzncc-admin/services/kzncc-revenue.service';

type AdminTab = 'overview' | 'users' | 'churches' | 'revenue' | 'communication' | 'events';

@Component({
  selector: 'app-kzncc-admin-dashboard',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, RoleSwitcherComponent],
  templateUrl: './kzncc-admin-dashboard.component.html',
  styleUrl: './kzncc-admin-dashboard.component.css'
})
export class KznccAdminDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly admin = inject(KznccAdminService);
  private readonly revenue = inject(KznccRevenueService);
  private readonly communication = inject(KznccCommunicationService);
  private readonly eventsService = inject(KznccEventService);
  private readonly wallets = inject(WalletService);

  readonly user = signal<User | null>(null);
  readonly activeTab = signal<AdminTab>('overview');
  readonly churches = signal<KznccChurch[]>([]);
  readonly paidServices = signal<KznccServiceRevenue[]>([]);
  readonly revenueSummary = signal<KznccRevenueSummary | null>(null);
  readonly walletSummary = signal<KznccWalletSummary | null>(null);
  readonly walletTransactions = signal<WalletTransaction[]>([]);
  readonly messages = signal<KznccAdminMessage[]>([]);
  readonly events = signal<KznccAdminEvent[]>([]);
  readonly managedUsers = signal<KznccManagedUser[]>([]);
  readonly selectedChurch = signal<KznccChurch | null>(null);
  readonly search = new FormControl('', { nonNullable: true });
  readonly region = new FormControl('All', { nonNullable: true });
  readonly status = new FormControl('All', { nonNullable: true });
  readonly sort = new FormControl('members', { nonNullable: true });
  readonly notice = signal('');
  readonly newUserFirstName = new FormControl('', { nonNullable: true });
  readonly newUserLastName = new FormControl('', { nonNullable: true });
  readonly newUserTelephone = new FormControl('', { nonNullable: true });
  readonly newUserEmail = new FormControl('', { nonNullable: true });
  readonly newUserRole = new FormControl<'KZNCC User' | 'KZNCC Admin'>(
    'KZNCC User',
    { nonNullable: true }
  );

  filteredChurches(): KznccChurch[] {
    const query = this.search.value.trim().toLowerCase();
    const region = this.region.value;
    const status = this.status.value;
    const churches = this.churches().filter(
      (church) =>
        (!query || church.name.toLowerCase().includes(query)) &&
        (region === 'All' || church.region === region) &&
        (status === 'All' || church.status === status)
    );

    return [...churches].sort((a, b) =>
      this.sort.value === 'revenue'
        ? b.totalRevenue - a.totalRevenue
        : b.registeredMembers - a.registeredMembers
    );
  }

  readonly regions = computed(() => [
    'All',
    ...new Set(this.churches().map(({ region }) => region))
  ]);

  readonly totalMembers = computed(() =>
    this.churches().reduce((sum, church) => sum + church.registeredMembers, 0)
  );
  readonly activeMembers = computed(() =>
    this.churches().reduce((sum, church) => sum + church.activeMembers, 0)
  );

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (user) => this.user.set(user),
      error: () => this.logout()
    });
    forkJoin({
      churches: this.admin.getKznccChurches(),
      paidServices: this.revenue.getPaidServices(),
      revenueSummary: this.revenue.getRevenueSummary(),
      walletSummary: this.wallets.getKznccRevenueWalletSummary('1'),
      wallet: this.wallets.getKznccWallet('1')
    }).subscribe(({ churches, paidServices, revenueSummary, walletSummary, wallet }) => {
      this.churches.set(churches);
      this.paidServices.set(paidServices);
      this.revenueSummary.set(revenueSummary);
      this.walletSummary.set(walletSummary);
      if (wallet) {
        this.wallets.getWalletTransactions(wallet.id).subscribe((transactions) =>
          this.walletTransactions.set(transactions)
        );
      }
    });
    this.admin.getKznccChurches().subscribe((churches) => this.churches.set(churches));
    this.communication.getMessageHistory().subscribe((messages) => this.messages.set(messages));
    this.eventsService.getKznccEvents().subscribe((events) => this.events.set(events));
    this.loadManagedUsers();
  }

  showTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    this.selectedChurch.set(null);
  }

  viewChurch(church: KznccChurch): void {
    this.selectedChurch.set(church);
  }

  addDemoChurch(): void {
    this.admin.addChurch({
      name: 'New KZNCC Community Church',
      registrationNumber: '',
      denomination: 'Christian Community',
      region: 'Midlands',
      province: 'KwaZulu-Natal',
      address: 'New church address',
      leaderName: 'Pastor New Leader',
      leaderRole: 'Pastor',
      contactNumber: '070 000 0000',
      email: 'newchurch@example.org',
      registeredMembers: 0,
      activeMembers: 0,
      paidServicesActivated: 0,
      totalRevenue: 0,
      churchRevenueShare: 0,
      kznccRevenueShare: 0,
      status: 'Pending',
      notes: 'Added manually through the KZNCC admin dashboard.'
    }).subscribe(() => this.notice.set('Church added to the KZNCC directory.'));
  }

  sendDemoMessage(draft = false): void {
    const message = {
      title: 'KZNCC community update',
      category: 'General announcement',
      body: 'This is a mock KZNCC communication ready for the future API.',
      targetAudience: 'All Members and Leaders',
      priority: 'Normal' as const
    };
    const request = draft
      ? this.communication.saveMessageDraft(message)
      : this.communication.sendMessage(message);
    request.subscribe(() => this.notice.set(draft ? 'Draft saved.' : 'Message sent.'));
  }

  createDemoEvent(): void {
    this.eventsService.createEvent({
      title: 'KZNCC Community Service Day',
      category: 'Community',
      date: '2026-08-15',
      startTime: '09:00',
      endTime: '14:00',
      location: 'Durban Central',
      description: 'A coordinated service day for KZNCC churches and members.',
      host: 'KZNCC',
      targetAudience: 'All KZNCC members',
      rsvpRequired: true,
      maximumAttendees: 1000,
      status: 'Published'
    }).subscribe(() => this.notice.set('Event published to KZNCC members.'));
  }

  requestPayout(): void {
    this.wallets.requestWalletPayout('kzncc-1', 50000).subscribe(() =>
      this.notice.set('KZNCC payout request submitted for review.')
    );
  }

  createKznccUser(): void {
    this.admin.createKznccUser({
      firstName: this.newUserFirstName.value.trim(),
      lastName: this.newUserLastName.value.trim(),
      telephoneNumber: this.newUserTelephone.value.trim(),
      email: this.newUserEmail.value.trim(),
      role: this.newUserRole.value
    }).subscribe({
      next: (created) => {
        this.managedUsers.update((users) => [...users, created]);
        this.notice.set(`${created.fullName} was added as ${this.newUserRole.value}.`);
        this.newUserFirstName.setValue('');
        this.newUserLastName.setValue('');
        this.newUserTelephone.setValue('');
        this.newUserEmail.setValue('');
      },
      error: (error) =>
        this.notice.set(error.error?.message ?? 'The KZNCC user could not be created.')
    });
  }

  removeKznccUser(managedUser: KznccManagedUser): void {
    this.admin.removeKznccUser(managedUser.id).subscribe({
      next: () => {
        this.managedUsers.update((users) =>
          users.filter(({ id }) => id !== managedUser.id)
        );
        this.notice.set(`${managedUser.fullName} was removed.`);
      },
      error: (error) =>
        this.notice.set(error.error?.message ?? 'The KZNCC user could not be removed.')
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  private loadManagedUsers(): void {
    this.admin.getKznccUsers().subscribe({
      next: (users) => this.managedUsers.set(users),
      error: (error) =>
        this.notice.set(error.error?.message ?? 'KZNCC users could not be loaded.')
    });
  }
}
