import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
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

type ProviderTab = 'overview' | 'vuma' | 'members' | 'billing' | 'invoices' | 'documents';

interface VumaFibreUser {
  id: string;
  memberName: string;
  cellphone: string;
  churchName: string;
  branchName: string;
  planName: string;
  monthlySpend: number;
  dataUsedGb: number;
  status: 'Active' | 'Pending installation' | 'Payment due';
  lastPaymentDate: string;
}

interface VumaChurchBreakdown {
  churchName: string;
  branchName: string;
  memberCount: number;
  totalSpend: number;
  averageSpend: number;
  totalDataUsedGb: number;
  members: VumaFibreUser[];
}

interface VumaService {
  code: 'education' | 'buy-data';
  name: string;
  description: string;
  image: string;
  activeUsers: number;
  monthlyRevenue: number;
  status: 'Live' | 'Ready';
}

interface VumaNetworkNode {
  level: string;
  name: string;
  area: string;
  countLabel: string;
  revenue: number;
  uptime: number;
}

interface VumaIspPerformance {
  name: string;
  layer: 'ISP' | 'Regional ISP' | 'Micro ISP';
  area: string;
  revenue: number;
  subscribers: number;
  uptime: number;
  growth: number;
}

interface VumaPublicity {
  active: boolean;
  title: string;
  message: string;
  image: string;
  link: string;
}

@Component({
  selector: 'app-service-provider-dashboard',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, RoleSwitcherComponent],
  templateUrl: './service-provider-dashboard.component.html',
  styleUrl: './service-provider-dashboard.component.css'
})
export class ServiceProviderDashboardComponent implements OnInit, OnDestroy {
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
  readonly vumaSearch = new FormControl('', { nonNullable: true });
  readonly vumaChurchFilter = new FormControl('ALL', { nonNullable: true });
  readonly notice = signal('');
  readonly liveVumaRevenue = signal(4294);
  private liveRevenueTimer?: ReturnType<typeof setInterval>;
  readonly communicationTarget = new FormControl('All Vuma subscribers', { nonNullable: true });
  readonly communicationArea = new FormControl('All areas', { nonNullable: true });
  readonly communicationMessage = new FormControl(
    'Your Vuma Force data bundle specials are available today. Visit your nearest Shop-in-Box or buy through Duranki Wallet.',
    { nonNullable: true }
  );
  private readonly vumaPublicityKey = 'inkolo_vuma_publicity';
  private readonly defaultVumaPublicity: VumaPublicity = {
    active: true,
    title: 'Bruno Mars: The Romantic Tour',
    message: 'Vumatel presents Bruno Mars live in South Africa at FNB Stadium, Johannesburg.',
    image: '/vuma-bruno-mars-publicity.png',
    link: 'https://vumatel.co.za'
  };
  readonly vumaPublicityImage = signal(this.defaultVumaPublicity.image);
  readonly vumaPublicityTitle = new FormControl(this.defaultVumaPublicity.title, {
    nonNullable: true
  });
  readonly vumaPublicityMessage = new FormControl(this.defaultVumaPublicity.message, {
    nonNullable: true
  });
  readonly vumaPublicityLink = new FormControl(this.defaultVumaPublicity.link, {
    nonNullable: true
  });
  readonly vumaServices = signal<VumaService[]>([
    {
      code: 'education',
      name: 'Education',
      description: 'EduU learning services, courses and education opportunities for Vuma-connected members.',
      image: '/service-education.png',
      activeUsers: 128,
      monthlyRevenue: 0,
      status: 'Live'
    },
    {
      code: 'buy-data',
      name: 'Buy Data',
      description: 'Data bundle purchases for members who need extra prepaid internet data.',
      image: '/service-airtime-data.png',
      activeUsers: 84,
      monthlyRevenue: 12650,
      status: 'Ready'
    }
  ]);
  readonly vumaUsers = signal<VumaFibreUser[]>([
    {
      id: 'vf-001',
      memberName: 'Jeremy Shabalala',
      cellphone: '072 555 0184',
      churchName: 'Grace Community Church',
      branchName: 'Umlazi Branch',
      planName: 'Vuma 50 Mbps Uncapped',
      monthlySpend: 699,
      dataUsedGb: 318,
      status: 'Active',
      lastPaymentDate: '2026-07-01'
    },
    {
      id: 'vf-002',
      memberName: 'Nandi Mthembu',
      cellphone: '071 234 5678',
      churchName: 'Grace Community Church',
      branchName: 'Umlazi Branch',
      planName: 'Vuma 100 Mbps Uncapped',
      monthlySpend: 899,
      dataUsedGb: 512,
      status: 'Active',
      lastPaymentDate: '2026-07-01'
    },
    {
      id: 'vf-003',
      memberName: 'Thabo Khumalo',
      cellphone: '073 456 1020',
      churchName: 'Zion Revival Church',
      branchName: 'KwaMashu Branch',
      planName: 'Vuma 25 Mbps Uncapped',
      monthlySpend: 549,
      dataUsedGb: 204,
      status: 'Payment due',
      lastPaymentDate: '2026-06-01'
    },
    {
      id: 'vf-004',
      memberName: 'Lerato Sithole',
      cellphone: '074 890 1122',
      churchName: 'New Hope Christian Centre',
      branchName: 'Pinetown Branch',
      planName: 'Vuma 50 Mbps Uncapped',
      monthlySpend: 699,
      dataUsedGb: 276,
      status: 'Active',
      lastPaymentDate: '2026-07-01'
    },
    {
      id: 'vf-005',
      memberName: 'Sibusiso Zulu',
      cellphone: '078 220 9011',
      churchName: 'Durban Central Fellowship',
      branchName: 'Central Branch',
      planName: 'Vuma 100 Mbps Uncapped',
      monthlySpend: 899,
      dataUsedGb: 441,
      status: 'Pending installation',
      lastPaymentDate: '2026-06-26'
    },
    {
      id: 'vf-006',
      memberName: 'Ayanda Dlamini',
      cellphone: '079 500 6007',
      churchName: 'Pietermaritzburg Worship Centre',
      branchName: 'Northdale Branch',
      planName: 'Vuma 25 Mbps Uncapped',
      monthlySpend: 549,
      dataUsedGb: 188,
      status: 'Active',
      lastPaymentDate: '2026-07-01'
    }
  ]);
  readonly vumaNetwork = signal<VumaNetworkNode[]>([
    {
      level: 'Main ISP',
      name: 'Vuma Force National Network',
      area: 'South Africa',
      countLabel: '1 core fibre network',
      revenue: 428450,
      uptime: 99.2
    },
    {
      level: 'Regional ISP',
      name: 'KZN Metro Fibre Partner',
      area: 'eThekwini and Msunduzi',
      countLabel: '4 district operators',
      revenue: 184720,
      uptime: 98.8
    },
    {
      level: 'District ISP',
      name: 'Durban South Access Hub',
      area: 'Umlazi, KwaMashu, Pinetown',
      countLabel: '9 community access points',
      revenue: 82390,
      uptime: 97.9
    },
    {
      level: 'Micro ISP',
      name: 'Shop-in-Box Entrepreneurs',
      area: 'Churches, townships and local retail units',
      countLabel: '26 micro ISP retailers',
      revenue: 39280,
      uptime: 96.7
    }
  ]);
  readonly vumaIspPerformance = signal<VumaIspPerformance[]>([
    {
      name: 'Vuma Force National',
      layer: 'ISP',
      area: 'National',
      revenue: 428450,
      subscribers: 1240,
      uptime: 99.2,
      growth: 18
    },
    {
      name: 'KZN Metro Partner',
      layer: 'Regional ISP',
      area: 'eThekwini',
      revenue: 184720,
      subscribers: 486,
      uptime: 98.8,
      growth: 24
    },
    {
      name: 'Durban South Hub',
      layer: 'Regional ISP',
      area: 'Umlazi / Pinetown',
      revenue: 82390,
      subscribers: 218,
      uptime: 97.9,
      growth: 31
    },
    {
      name: 'Grace Shop-in-Box',
      layer: 'Micro ISP',
      area: 'Umlazi',
      revenue: 18560,
      subscribers: 72,
      uptime: 97.2,
      growth: 38
    },
    {
      name: 'KwaMashu Retail Unit',
      layer: 'Micro ISP',
      area: 'KwaMashu',
      revenue: 13280,
      subscribers: 54,
      uptime: 95.9,
      growth: 21
    },
    {
      name: 'Northdale Community Desk',
      layer: 'Micro ISP',
      area: 'Pietermaritzburg',
      revenue: 7440,
      subscribers: 31,
      uptime: 96.4,
      growth: 16
    }
  ]);

  ngOnInit(): void {
    this.loadVumaPublicity();
    this.startLiveRevenueCounter();
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

  ngOnDestroy(): void {
    if (this.liveRevenueTimer) {
      clearInterval(this.liveRevenueTimer);
    }
  }

  private startLiveRevenueCounter(): void {
    this.liveRevenueTimer = setInterval(() => {
      const increment = [29, 49, 79, 99, 149][Math.floor(Math.random() * 5)];
      this.liveVumaRevenue.update((value) => value + increment);
    }, 2600);
  }

  loadVumaPublicity(): void {
    const publicity = this.getVumaPublicity();
    this.vumaPublicityTitle.setValue(publicity.title);
    this.vumaPublicityMessage.setValue(publicity.message);
    this.vumaPublicityLink.setValue(publicity.link);
    this.vumaPublicityImage.set(publicity.image);
  }

  uploadVumaPublicityImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      this.vumaPublicityImage.set(String(reader.result || this.defaultVumaPublicity.image));
    });
    reader.readAsDataURL(file);
  }

  publishVumaPublicity(): void {
    const publicity: VumaPublicity = {
      active: true,
      title: this.vumaPublicityTitle.value.trim() || this.defaultVumaPublicity.title,
      message: this.vumaPublicityMessage.value.trim() || this.defaultVumaPublicity.message,
      image: this.vumaPublicityImage() || this.defaultVumaPublicity.image,
      link: this.vumaPublicityLink.value.trim() || this.defaultVumaPublicity.link
    };
    try {
      localStorage.setItem(this.vumaPublicityKey, JSON.stringify(publicity));
      this.notice.set('Publicity published for Vuma subscribers.');
    } catch {
      this.notice.set('Publicity could not be saved in this browser.');
    }
  }

  resetVumaPublicity(): void {
    try {
      localStorage.setItem(this.vumaPublicityKey, JSON.stringify(this.defaultVumaPublicity));
    } catch {
      // Demo storage can be unavailable in some embedded browser modes.
    }
    this.loadVumaPublicity();
    this.notice.set('Demo publicity restored for Vuma subscribers.');
  }

  private getVumaPublicity(): VumaPublicity {
    try {
      return JSON.parse(localStorage.getItem(this.vumaPublicityKey) || 'null') ??
        this.defaultVumaPublicity;
    } catch {
      return this.defaultVumaPublicity;
    }
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

  filteredVumaUsers(): VumaFibreUser[] {
    const query = this.vumaSearch.value.toLowerCase().trim();
    return this.vumaUsers().filter((member) =>
      (!query ||
        member.memberName.toLowerCase().includes(query) ||
        member.cellphone.includes(query) ||
        member.planName.toLowerCase().includes(query)) &&
      (this.vumaChurchFilter.value === 'ALL' ||
        member.churchName === this.vumaChurchFilter.value)
    );
  }

  vumaChurchOptions(): string[] {
    return [...new Set(this.vumaUsers().map(({ churchName }) => churchName))].sort();
  }

  vumaTotalSpend(): number {
    return this.filteredVumaUsers().reduce((sum, member) => sum + member.monthlySpend, 0);
  }

  vumaAverageSpend(): number {
    const users = this.filteredVumaUsers();
    return users.length ? this.vumaTotalSpend() / users.length : 0;
  }

  vumaTotalDataUsed(): number {
    return this.filteredVumaUsers().reduce((sum, member) => sum + member.dataUsedGb, 0);
  }

  vumaActiveUsers(): number {
    return this.filteredVumaUsers().filter(({ status }) => status === 'Active').length;
  }

  vumaServiceRevenue(): number {
    return this.vumaServices().reduce((sum, service) => sum + service.monthlyRevenue, 0);
  }

  vumaMaxPerformanceRevenue(): number {
    return Math.max(...this.vumaIspPerformance().map(({ revenue }) => revenue), 1);
  }

  vumaPerformanceWidth(revenue: number): number {
    return Math.max(7, Math.round((revenue / this.vumaMaxPerformanceRevenue()) * 100));
  }

  sendVumaCommunication(): void {
    this.notice.set(
      `Message queued for ${this.communicationTarget.value} in ${this.communicationArea.value}.`
    );
  }

  vumaChurchBreakdown(): VumaChurchBreakdown[] {
    const groups = new Map<string, VumaFibreUser[]>();
    for (const member of this.filteredVumaUsers()) {
      const key = `${member.churchName}::${member.branchName}`;
      groups.set(key, [...(groups.get(key) ?? []), member]);
    }
    return [...groups.values()].map((members) => {
      const totalSpend = members.reduce((sum, member) => sum + member.monthlySpend, 0);
      return {
        churchName: members[0].churchName,
        branchName: members[0].branchName,
        memberCount: members.length,
        totalSpend,
        averageSpend: totalSpend / members.length,
        totalDataUsedGb: members.reduce((sum, member) => sum + member.dataUsedGb, 0),
        members
      };
    }).sort((a, b) => b.totalSpend - a.totalSpend);
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
