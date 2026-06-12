import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService, User } from '../../../auth.service';
import { RoleSwitcherComponent } from '../../../shared/components/role-switcher/role-switcher.component';
import { BillingCycle } from '../models/billing-cycle.model';
import { MemberDocument } from '../models/member-document.model';
import { PaidServiceMember } from '../models/paid-service-member.model';
import { ServiceProviderInvoice } from '../models/service-provider-invoice.model';
import { ServiceProviderBillingService } from '../services/service-provider-billing.service';
import { ServiceProviderDocumentService } from '../services/service-provider-document.service';
import { ServiceProviderInvoiceService } from '../services/service-provider-invoice.service';
import {
  ServiceProviderDashboardSummary,
  ServiceProviderService
} from '../services/service-provider.service';

type ProviderTab = 'overview' | 'members' | 'billing' | 'invoices' | 'documents';

@Component({
  selector: 'app-service-provider-dashboard',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, RoleSwitcherComponent],
  templateUrl: './service-provider-dashboard.component.html',
  styleUrl: './service-provider-dashboard.component.css'
})
export class ServiceProviderDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly providers = inject(ServiceProviderService);
  private readonly billing = inject(ServiceProviderBillingService);
  private readonly invoicesService = inject(ServiceProviderInvoiceService);
  private readonly documentsService = inject(ServiceProviderDocumentService);

  readonly providerId = 'sp-001';
  readonly user = signal<User | null>(null);
  readonly role = signal(this.route.snapshot.data['role'] as string);
  readonly activeTab = signal<ProviderTab>('overview');
  readonly summary = signal<ServiceProviderDashboardSummary | null>(null);
  readonly members = signal<PaidServiceMember[]>([]);
  readonly cycles = signal<BillingCycle[]>([]);
  readonly invoices = signal<ServiceProviderInvoice[]>([]);
  readonly documents = signal<MemberDocument[]>([]);
  readonly search = new FormControl('', { nonNullable: true });
  readonly paymentFilter = new FormControl('ALL', { nonNullable: true });
  readonly policyFilter = new FormControl('ALL', { nonNullable: true });
  readonly notice = signal('');

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (user) => this.user.set(user),
      error: () => this.logout()
    });
    forkJoin({
      summary: this.providers.getServiceProviderDashboardSummary(this.providerId),
      members: this.providers.getPaidMembersByServiceProvider(this.providerId),
      cycles: this.billing.getBillingCycles(this.providerId)
    }).subscribe(({ summary, members, cycles }) => {
      this.summary.set(summary);
      this.members.set(members);
      this.cycles.set(cycles);
    });
    this.invoicesService.getInvoiceHistory(this.providerId).subscribe((invoices) =>
      this.invoices.set(invoices)
    );
    this.documentsService.getDocumentsByServiceProvider(this.providerId).subscribe((documents) =>
      this.documents.set(documents)
    );
  }

  filteredMembers(): PaidServiceMember[] {
    const query = this.search.value.toLowerCase().trim();
    return this.members().filter((member) =>
      (!query ||
        member.memberName.toLowerCase().includes(query) ||
        member.policyNumber?.toLowerCase().includes(query)) &&
      (this.paymentFilter.value === 'ALL' ||
        member.paymentStatus === this.paymentFilter.value) &&
      (this.policyFilter.value === 'ALL' ||
        member.policyStatus === this.policyFilter.value)
    );
  }

  generateInvoice(): void {
    this.invoicesService
      .createInvoiceForBillingCycle(this.providerId, 'bc-2026-06')
      .subscribe((invoice) =>
        this.notice.set(
          `${invoice.invoiceNumber} created from ${invoice.totalMembersPaid} paid members only.`
        )
      );
  }

  submitInvoice(invoice: ServiceProviderInvoice): void {
    if (this.role() !== 'Service Provider Admin') {
      this.notice.set('Your role may prepare drafts but cannot submit invoices.');
      return;
    }
    this.invoicesService.submitInvoice(invoice.id).subscribe(() =>
      this.notice.set(`${invoice.invoiceNumber} submitted for approval.`)
    );
  }

  uploadPolicy(member: PaidServiceMember, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    if (
      !this.documentsService.canServiceProviderUploadDocument(
        this.providerId,
        member.memberId,
        member.serviceId
      )
    ) {
      this.notice.set('You cannot upload a document for this member.');
      return;
    }
    this.documentsService
      .uploadMemberPolicyDocument(member.memberId, member.serviceId, file)
      .subscribe(() => this.notice.set(`Policy uploaded for ${member.memberName}.`));
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
