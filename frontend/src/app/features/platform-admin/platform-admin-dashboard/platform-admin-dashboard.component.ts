import { CurrencyPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../../auth.service';
import { RoleService } from '../../../core/services/role.service';
import { RoleSwitcherComponent } from '../../../shared/components/role-switcher/role-switcher.component';

type TenantStatus = 'Configured' | 'Active' | 'Inactive';
type CommunityStatus = 'Active' | 'Inactive';
type CommunityType = 'Church' | 'Business' | 'Township' | 'Education' | 'General';
type DashboardView = 'platform' | 'tenant' | 'community';
type ServiceAdminScope = 'Platform' | 'Tenant' | 'Community';

interface ServiceAdminUser {
  name: string;
  email: string;
  telephone: string;
  scope: ServiceAdminScope;
}

interface DurankiService {
  code: string;
  name: string;
  category: string;
  description: string;
  price: number;
  currency: string;
  dashboardName: string;
  dashboardRoute: string;
  adminUsers: ServiceAdminUser[];
}

interface Tenant {
  id: string;
  name: string;
  companyName: string;
  registrationNumber: string;
  contactPerson: string;
  email: string;
  telephone: string;
  address: string;
  country: string;
  website: string;
  subdomain: string;
  status: TenantStatus;
  serviceCodes: string[];
  tenantAdmin: { name: string; email: string; telephone: string };
  branding: {
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    heroImageUrl: string;
  };
  websiteConfig: {
    domainName: string;
    websiteTitle: string;
    mainHeading: string;
    shortDescription: string;
    aboutText: string;
    address: string;
    email: string;
    telephone: string;
    socialLinks: string;
    callToActionText: string;
  };
  pricing: {
    monthlyPlatformFee: number;
    transactionFeePercentage: number;
    durankiPercentage: number;
    tenantPercentage: number;
    communityPercentage: number;
    partnerPercentage: number;
  };
  settings: { currency: string; language: string; billingModel: string };
}

interface Community {
  id: string;
  tenantId: string;
  name: string;
  type: CommunityType;
  country: string;
  region: string;
  town: string;
  logoUrl: string;
  administrator: string;
  contactDetails: string;
  description: string;
  branding: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
  };
  status: CommunityStatus;
  serviceCodes: string[];
  members: number;
  users: number;
  transactions: number;
  projects: number;
}

const defaultService = (
  code: string,
  name: string,
  category: string,
  description: string,
  price = 0
): DurankiService => ({
  code,
  name,
  category,
  description,
  price,
  currency: 'ZAR',
  dashboardName: `${name} Dashboard`,
  dashboardRoute: `/dashboard/services/${code}`,
  adminUsers: []
});

const defaultServices: DurankiService[] = [
  { ...defaultService('duranki-heritage', 'Duranki Heritage / Family Tree', 'Community', 'Family trees, genealogy verification and traditional leadership records.', 0), dashboardRoute: '/dashboard/heritage' },
  defaultService('marketplace', 'Marketplace', 'Commerce', 'Community buying and selling.', 49),
  defaultService('jobs', 'Jobs', 'Work', 'Jobs, gigs and local opportunities.', 39),
  defaultService('airtime', 'Airtime', 'Utilities', 'Mobile airtime top-ups.', 0),
  defaultService('utilities', 'Utilities', 'Utilities', 'Electricity and utility payments.', 0),
  defaultService('payments', 'Payments', 'Money', 'Payment collection and routing.', 0),
  defaultService('wallet', 'Wallet', 'Money', 'Duranki Wallet services.', 0),
  defaultService('community-membership', 'Community Membership', 'Membership', 'Configurable community access fee with wallet or card payment.', 25),
  defaultService('grant-distribution', 'Grant Distribution', 'Public funding', 'Government grant payment, tracking and reconciliation for approved community traders.', 0),
  defaultService('trader-training', 'Trader Training', 'Learning', 'Configurable trader training modules, assessments and grant-linked funding milestones.', 0),
  defaultService('vuma-fibre', 'Vuma Force', 'Connectivity', 'Vuma fibre, data and micro ISP services.', 99),
  defaultService('internet', 'Internet', 'Connectivity', 'Internet, fibre and data services.', 99),
  defaultService('insurance', 'Insurance', 'Financial services', 'Insurance services and policies.', 29),
  defaultService('education', 'Education', 'Learning', 'Education and digital learning.', 59),
  defaultService('funeral-cover', 'Funeral Cover', 'Financial services', 'Funeral cover products.', 35),
  defaultService('loans', 'Loans', 'Financial services', 'Loan applications and approvals.', 0),
  defaultService('pos', 'POS', 'Business', 'Point-of-sale tools for retailers.', 149),
  defaultService('deliveries', 'Catch a Ride / Deliveries', 'Logistics', 'Ride matching and local delivery services.', 49),
  defaultService('referral', 'Referral', 'Community', 'Member referrals and referral tracking.', 0),
  defaultService('keycha-properties', 'Properties', 'Property', 'Property listings and member enquiries.', 0),
  defaultService('business-services', 'Business Services', 'Business', 'Business support tools.', 79),
  defaultService('projects', 'Projects', 'Community', 'Community projects and reporting.', 25)
];

const serviceCodeAliases: Record<string, string> = {
  'jobs-gigs': 'jobs',
  'airtime-utilities': 'airtime',
  vuma: 'vuma-fibre',
  transport: 'deliveries',
  'uif-trader-training': 'trader-training',
  membership: 'community-membership'
};

const defaultBranding = {
  logoUrl: '',
  primaryColor: '#063a78',
  secondaryColor: '#0a83e9',
  accentColor: '#8be43b',
  heroImageUrl: ''
};

const defaultCommunityBranding = {
  primaryColor: '#063a78',
  secondaryColor: '#0a83e9',
  accentColor: '#8be43b',
  backgroundColor: '#f3f9fd'
};

const defaultPricing = {
  monthlyPlatformFee: 2500,
  transactionFeePercentage: 2.5,
  durankiPercentage: 10,
  tenantPercentage: 60,
  communityPercentage: 25,
  partnerPercentage: 5
};

const defaultTenants: Tenant[] = communityHierarchy([{"id":"tenant-ingwe-connect","name":"Ingwe Connect","companyName":"Ingwe Connect","registrationNumber":"","contactPerson":"","email":"","telephone":"","address":"","country":"South Africa","website":"","subdomain":"","status":"Configured","serviceCodes":[],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"","primaryColor":"#171717","secondaryColor":"#caa33d","accentColor":"#f4d878","heroImageUrl":""},"websiteConfig":{"domainName":"","websiteTitle":"Ingwe Connect","mainHeading":"Ingwe Connect","shortDescription":"","aboutText":"","address":"","email":"","telephone":"","socialLinks":"","callToActionText":"Get started"},"pricing":{"monthlyPlatformFee":0,"transactionFeePercentage":0,"durankiPercentage":0,"tenantPercentage":0,"communityPercentage":0,"partnerPercentage":0},"settings":{"currency":"ZAR","language":"English","billingModel":"Not configured"}},{"id":"tenant-inkolo","name":"Inkolo","companyName":"Inkolo","registrationNumber":"","contactPerson":"","email":"","telephone":"","address":"","country":"South Africa","website":"","subdomain":"","status":"Active","serviceCodes":["marketplace","jobs","wallet","payments","airtime","utilities","vuma-fibre","insurance","education","funeral-cover","projects"],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"/inkolo-connect-logo.png","primaryColor":"#062d6b","secondaryColor":"#087ce8","accentColor":"#58c91a","heroImageUrl":""},"websiteConfig":{"domainName":"www.inkolo.co.za","websiteTitle":"Inkolo Communities","mainHeading":"Connected services for faith and community networks","shortDescription":"Inkolo uses Duranki to manage communities, members, services, payments, projects and communication.","aboutText":"Inkolo is a tenant inside the Duranki platform. Its communities sit underneath Inkolo and receive only the services enabled for that tenant.","address":"","email":"","telephone":"","socialLinks":"","callToActionText":"Join Inkolo"},"pricing":{"monthlyPlatformFee":0,"transactionFeePercentage":0,"durankiPercentage":0,"tenantPercentage":0,"communityPercentage":0,"partnerPercentage":0},"settings":{"currency":"ZAR","language":"English","billingModel":"Not configured"}},{"id":"tenant-trader-connect","name":"Trader Connect","companyName":"Trader Connect","registrationNumber":"","contactPerson":"","email":"","telephone":"","address":"","country":"South Africa","website":"","subdomain":"","status":"Active","serviceCodes":["marketplace","jobs","wallet","payments","community-membership","airtime","utilities","vuma-fibre","education","grant-distribution","trader-training","funeral-cover","deliveries","business-services","pos","projects"],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"/trader-connect-logo.png","primaryColor":"#063f91","secondaryColor":"#0a83e9","accentColor":"#58c91a","heroImageUrl":""},"websiteConfig":{"domainName":"www.traderconnect.co.za","websiteTitle":"Trader Connect","mainHeading":"Connect, trade and grow with businesses around you","shortDescription":"Trader Connect uses Duranki to organise trader communities by district and block with marketplace, wallet, jobs, utilities, transport, fibre, referrals, training and protection services.","aboutText":"Trader Connect is a Duranki tenant for local traders. It helps verified traders find each other, activate business services, share local opportunities and communicate inside district and block communities.","address":"","email":"","telephone":"","socialLinks":"","callToActionText":"Join Trader Connect"},"pricing":{"monthlyPlatformFee":0,"transactionFeePercentage":0,"durankiPercentage":0,"tenantPercentage":0,"communityPercentage":0,"partnerPercentage":0},"settings":{"currency":"ZAR","language":"English","billingModel":"Not configured"}},{"id":"tenant-zuc","name":"ZUC","companyName":"ZUC","registrationNumber":"","contactPerson":"","email":"","telephone":"","address":"","country":"South Africa","website":"https://www.zuc.co.za","subdomain":"","status":"Configured","serviceCodes":["marketplace","jobs","wallet","payments","airtime","utilities","internet","education","projects"],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"/zuc-logo.png","primaryColor":"#1c4b82","secondaryColor":"#2f9f7b","accentColor":"#f3c744","heroImageUrl":""},"websiteConfig":{"domainName":"www.zuc.co.za","websiteTitle":"ZUC","mainHeading":"ZUC powered by Duranki","shortDescription":"ZUC is configured as a tenant inside the Duranki platform and can activate services for its communities.","aboutText":"ZUC can manage communities, users, services, transactions and reports through its own Duranki tenant dashboard.","address":"","email":"","telephone":"","socialLinks":"","callToActionText":"Join ZUC"},"pricing":{"monthlyPlatformFee":0,"transactionFeePercentage":0,"durankiPercentage":0,"tenantPercentage":0,"communityPercentage":0,"partnerPercentage":0},"settings":{"currency":"ZAR","language":"English","billingModel":"Not configured"}}], []).tenants;

const defaultCommunities: Community[] = communityHierarchy([], [{"id":"community-ilembe-traders","tenantId":"tenant-trader-connect","name":"Traders KZN","type":"Business","country":"South Africa","region":"KwaZulu-Natal","town":"Ilembe District","logoUrl":"/trader-connect-logo.png","administrator":"","contactDetails":"","description":"Trader Connect community for KZN traders receiving government grant support, trader onboarding, grant reconciliation and trader training.","branding":{"primaryColor":"#0b3d2e","secondaryColor":"#16a34a","accentColor":"#facc15","backgroundColor":"#effaf3"},"status":"Active","serviceCodes":["marketplace","jobs","wallet","payments","community-membership","grant-distribution","trader-training","business-services","projects"],"members":0,"users":0,"transactions":0,"projects":0},{"id":"community-zuc","tenantId":"tenant-zuc","name":"ZUC Community","type":"Church","country":"South Africa","region":"KwaZulu-Natal","town":"Ilembe District","logoUrl":"/trader-connect-logo.png","administrator":"","contactDetails":"","description":"","branding":{"primaryColor":"#0b3d2e","secondaryColor":"#16a34a","accentColor":"#facc15","backgroundColor":"#effaf3"},"status":"Active","serviceCodes":[],"members":0,"users":0,"transactions":0,"projects":0},{"id":"community-core-inkolo","tenantId":"tenant-inkolo","name":"Inkolo Connect","type":"General","country":"South Africa","region":"KwaZulu-Natal","town":"Ilembe District","logoUrl":"/trader-connect-logo.png","administrator":"","contactDetails":"","description":"","branding":{"primaryColor":"#0b3d2e","secondaryColor":"#16a34a","accentColor":"#facc15","backgroundColor":"#effaf3"},"status":"Active","serviceCodes":[],"members":0,"users":0,"transactions":0,"projects":0}]).communities;

@Component({
  selector: 'app-platform-admin-dashboard',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, RoleSwitcherComponent],
  templateUrl: './platform-admin-dashboard.component.html',
  styleUrl: './platform-admin-dashboard.component.css'
})
export class PlatformAdminDashboardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly roles = inject(RoleService);
  private readonly tenantsKey = 'duranki_platform_tenants';
  private readonly communitiesKey = 'duranki_platform_communities';
  private readonly servicesKey = 'duranki_platform_services';
  private onlineTicker?: ReturnType<typeof setInterval>;

  readonly services = signal<DurankiService[]>(
    this.normalizeServices(this.readStored(this.servicesKey, defaultServices))
  );
  readonly tenants = signal<Tenant[]>(
    this.ensureDefaultTenants(this.readStored(this.tenantsKey, defaultTenants))
  );
  readonly communities = signal<Community[]>(
    this.ensureDefaultCommunities(this.readStored(this.communitiesKey, defaultCommunities))
  );
  readonly view = signal<DashboardView>('platform');
  readonly selectedTenantId = signal(this.tenants()[0]?.id ?? defaultTenants[0].id);
  readonly selectedCommunityId = signal(this.communities()[0]?.id ?? defaultCommunities[0].id);
  readonly editingTenantId = signal<string | null>(null);
  readonly notice = signal('');
  readonly tenantInviteMessage = signal('');
  readonly user = signal<User | null>(null);
  readonly onlineUsers = signal(0);

  readonly tenantName = new FormControl('Evolve', { nonNullable: true });
  readonly companyName = new FormControl('Evolve Digital Communities', { nonNullable: true });
  readonly registrationNumber = new FormControl('EV-2026-001', { nonNullable: true });
  readonly contactPerson = new FormControl('', { nonNullable: true });
  readonly tenantEmail = new FormControl('', { nonNullable: true });
  readonly tenantTelephone = new FormControl('', { nonNullable: true });
  readonly tenantAddress = new FormControl('Johannesburg, Gauteng', { nonNullable: true });
  readonly tenantCountry = new FormControl('South Africa', { nonNullable: true });
  readonly tenantWebsite = new FormControl('https://evolve.duranki.com', { nonNullable: true });
  readonly tenantSubdomain = new FormControl('evolve.duranki.com', { nonNullable: true });
  readonly tenantStatus = new FormControl<TenantStatus>('Configured', { nonNullable: true });
  readonly tenantAdminName = new FormControl('', { nonNullable: true });
  readonly tenantAdminEmail = new FormControl('', { nonNullable: true });
  readonly tenantAdminTelephone = new FormControl('', { nonNullable: true });
  readonly tenantLogo = new FormControl('', { nonNullable: true });
  readonly primaryColor = new FormControl('#063a78', { nonNullable: true });
  readonly secondaryColor = new FormControl('#0a83e9', { nonNullable: true });
  readonly accentColor = new FormControl('#8be43b', { nonNullable: true });
  readonly heroImageUrl = new FormControl('', { nonNullable: true });
  readonly domainName = new FormControl('www.evolve.co.za', { nonNullable: true });
  readonly websiteTitle = new FormControl('Evolve Digital Communities', { nonNullable: true });
  readonly mainHeading = new FormControl('Digital services for connected communities', { nonNullable: true });
  readonly shortDescription = new FormControl('Evolve uses Duranki to bring services into communities.', { nonNullable: true });
  readonly aboutText = new FormControl('A tenant website generated from the standard Duranki website template.', { nonNullable: true });
  readonly socialLinks = new FormControl('facebook.com/evolve', { nonNullable: true });
  readonly callToActionText = new FormControl('Join this community', { nonNullable: true });
  readonly monthlyPlatformFee = new FormControl(2500, { nonNullable: true });
  readonly transactionFeePercentage = new FormControl(2.5, { nonNullable: true });
  readonly durankiPercentage = new FormControl(10, { nonNullable: true });
  readonly tenantPercentage = new FormControl(60, { nonNullable: true });
  readonly communityPercentage = new FormControl(25, { nonNullable: true });
  readonly partnerPercentage = new FormControl(5, { nonNullable: true });
  readonly tenantServiceCodes = signal<string[]>(['marketplace', 'jobs', 'wallet', 'payments', 'education', 'internet']);
  readonly newServiceName = new FormControl('', { nonNullable: true });
  readonly newServiceCategory = new FormControl('Future services', { nonNullable: true });
  readonly newServiceDescription = new FormControl('', { nonNullable: true });
  readonly newServicePrice = new FormControl(0, { nonNullable: true });
  readonly newServiceDashboardName = new FormControl('', { nonNullable: true });
  readonly newServiceDashboardRoute = new FormControl('', { nonNullable: true });
  readonly newServiceAdminName = new FormControl('', { nonNullable: true });
  readonly newServiceAdminEmail = new FormControl('', { nonNullable: true });
  readonly newServiceAdminTelephone = new FormControl('', { nonNullable: true });
  readonly adminServiceCode = new FormControl('vuma-fibre', { nonNullable: true });
  readonly serviceAdminName = new FormControl('', { nonNullable: true });
  readonly serviceAdminEmail = new FormControl('', { nonNullable: true });
  readonly serviceAdminTelephone = new FormControl('', { nonNullable: true });
  readonly serviceAdminScope = new FormControl<ServiceAdminScope>('Tenant', { nonNullable: true });

  readonly communityName = new FormControl('Eritrea Community', { nonNullable: true });
  readonly communityType = new FormControl<CommunityType>('General', { nonNullable: true });
  readonly communityCountry = new FormControl('South Africa', { nonNullable: true });
  readonly communityRegion = new FormControl('Gauteng', { nonNullable: true });
  readonly communityTown = new FormControl('Johannesburg', { nonNullable: true });
  readonly communityLogo = new FormControl('', { nonNullable: true });
  readonly communityAdministrator = new FormControl('Community Administrator', { nonNullable: true });
  readonly communityContact = new FormControl('admin@community.local', { nonNullable: true });
  readonly communityDescription = new FormControl('Community managed under the selected tenant.', { nonNullable: true });
  readonly communityStatus = new FormControl<CommunityStatus>('Active', { nonNullable: true });
  readonly communityServiceCodes = signal<string[]>(['marketplace', 'jobs', 'wallet']);
  readonly communityPrimaryColor = new FormControl('#063a78', { nonNullable: true });
  readonly communitySecondaryColor = new FormControl('#0a83e9', { nonNullable: true });
  readonly communityAccentColor = new FormControl('#8be43b', { nonNullable: true });
  readonly communityBackgroundColor = new FormControl('#f3f9fd', { nonNullable: true });

  readonly selectedTenant = computed(() =>
    this.tenants().find((tenant) => tenant.id === this.selectedTenantId()) ?? this.tenants()[0]
  );
  readonly selectedTenantBranding = computed(() => this.selectedTenant()?.branding ?? defaultBranding);
  readonly communitiesForSelectedTenant = computed(() =>
    this.communities().filter((community) => community.tenantId === this.selectedTenant()?.id)
  );
  readonly selectedCommunity = computed(() =>
    this.communities().find((community) => community.id === this.selectedCommunityId()) ??
    this.communitiesForSelectedTenant()[0]
  );
  readonly selectedCommunityBranding = computed(() =>
    this.selectedCommunity()?.branding ??
    this.communityBrandingForTenant(this.selectedTenant()?.id)
  );
  readonly platformRevenue = computed(() =>
    this.communities().reduce((sum, community) => sum + community.transactions, 0)
  );
  readonly platformUsers = signal(0);
  readonly onlinePercentage = computed(() => {
    const total = this.platformUsers();
    return total ? Math.min(100, Math.round((this.onlineUsers() / total) * 100)) : 0;
  });
  readonly onlineGaugeRatio = computed(() => {
    const total = this.platformUsers();
    return total ? Math.min(1, Math.max(0, this.onlineUsers() / total)) : 0;
  });
  readonly onlineGaugeRotation = computed(() => {
    const exactAngle = -90 + this.onlineGaugeRatio() * 180;
    return `${exactAngle}deg`;
  });
  readonly onlineGaugeFill = computed(() => `${this.onlineGaugeRatio() * 50}%`);
  readonly offlineUsers = computed(() =>
    Math.max(0, this.platformUsers() - this.onlineUsers())
  );
  readonly onlineGaugeTicks = computed(() => {
    const total = this.platformUsers();
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      label: Math.round(total * ratio)
    }));
  });
  readonly grantDistributionBatches = [] as {name:string;traders:number;amount:number;paid:number;status:string}[];
  readonly grantControls = [
    'Beneficiary register',
    'Grant amount configuration',
    'Payment approval workflow',
    'Wallet payout tracking',
    'Bank proof upload',
    'Reconciliation report'
  ];
  readonly uifTrainingModules = [] as {title:string;learners:number;completed:number;status:string}[];

  ngOnInit(): void {
    void this.loadUploadedBranding();
    const scope = new URLSearchParams(location.search);
    if (scope.has('communityId')) this.openCommunityById(scope.get('communityId')!);
    else if (scope.has('tenantId')) this.openTenantById(scope.get('tenantId')!);
    this.refreshOnlineUsers();
    this.onlineTicker = setInterval(() => this.refreshOnlineUsers(), 4500);
    this.auth.getProfile().subscribe({
      next: (user) => this.user.set(user),
      error: () => this.logout()
    });
  }

  async loadUploadedBranding(): Promise<void> {
    const token = sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token') || '';
    if (!token) return;
    try {
      const response = await fetch('/api/branding', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (!response.ok) return;
      const rows: {kind:string;id:string;aliases?:string[];logoUrl:string}[] = await response.json();
      if (!Array.isArray(rows) || token !== (sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token') || '')) return;
      const apply = <T extends {id:string;branding:{logoUrl:string}}>(items:T[], kind:string):T[] => items.map(item => {
        const uploaded = rows.find(row => row.kind === kind && (row.id === item.id || row.aliases?.includes(item.id)));
        if (!uploaded || !/^\/api\/branding\/images\/[a-f0-9]{64}$/.test(uploaded.logoUrl)) return item;
        return { ...item, branding: { ...item.branding, logoUrl: uploaded.logoUrl } };
      });
      this.tenants.update(items => apply(items, 'tenant'));
      this.communities.update(items => apply(items, 'community'));
    } catch {
      // Keep existing branding if the logo service is unavailable.
    }
  }

  ngOnDestroy(): void {
    if (this.onlineTicker) {
      clearInterval(this.onlineTicker);
    }
  }

  refreshOnlineUsers(): void {durankiRefreshDirectory(this);}

  openPlatform(): void {
    this.view.set('platform');
  }

  openTenant(tenant: Tenant | undefined): void {
    if (!tenant) return;
    window.history.replaceState(window.history.state, '', '/dashboard/platform-admin?tenantId=' + encodeURIComponent(tenant.id));
    this.selectedTenantId.set(tenant.id);
    const firstCommunity = this.communities().find((community) => community.tenantId === tenant.id);
    if (firstCommunity) this.selectedCommunityId.set(firstCommunity.id);
    this.applyTenantColorsToCommunityForm(tenant);
    this.view.set('tenant');
  }

  openTenantById(tenantId: string): void {
    this.openTenant(this.tenants().find((tenant) => tenant.id === tenantId));
  }

  openCommunity(community: Community): void {
    window.history.replaceState(window.history.state, '', '/dashboard/platform-admin?communityId=' + encodeURIComponent(community.id));
    this.selectedTenantId.set(community.tenantId);
    this.selectedCommunityId.set(community.id);
    this.view.set('community');
  }

  openCommunityById(communityId: string | undefined): void {
    const community = this.communities().find((item) => item.id === communityId);
    if (community) {
      this.openCommunity(community);
    }
  }

  loadTenantForEdit(tenant: Tenant): void {
    this.editingTenantId.set(tenant.id);
    this.tenantName.setValue(tenant.name);
    this.companyName.setValue(tenant.companyName);
    this.registrationNumber.setValue(tenant.registrationNumber);
    this.contactPerson.setValue(tenant.contactPerson);
    this.tenantEmail.setValue(tenant.email);
    this.tenantTelephone.setValue(tenant.telephone);
    this.tenantAddress.setValue(tenant.address);
    this.tenantCountry.setValue(tenant.country);
    this.tenantWebsite.setValue(tenant.website);
    this.tenantSubdomain.setValue(tenant.subdomain);
    this.tenantStatus.setValue(tenant.status);
    this.tenantAdminName.setValue(tenant.tenantAdmin.name);
    this.tenantAdminEmail.setValue(tenant.tenantAdmin.email);
    this.tenantAdminTelephone.setValue(tenant.tenantAdmin.telephone);
    this.tenantLogo.setValue(tenant.branding.logoUrl);
    this.primaryColor.setValue(tenant.branding.primaryColor);
    this.secondaryColor.setValue(tenant.branding.secondaryColor);
    this.accentColor.setValue(tenant.branding.accentColor);
    this.heroImageUrl.setValue(tenant.branding.heroImageUrl);
    this.domainName.setValue(tenant.websiteConfig.domainName);
    this.websiteTitle.setValue(tenant.websiteConfig.websiteTitle);
    this.mainHeading.setValue(tenant.websiteConfig.mainHeading);
    this.shortDescription.setValue(tenant.websiteConfig.shortDescription);
    this.aboutText.setValue(tenant.websiteConfig.aboutText);
    this.socialLinks.setValue(tenant.websiteConfig.socialLinks);
    this.callToActionText.setValue(tenant.websiteConfig.callToActionText);
    this.monthlyPlatformFee.setValue(tenant.pricing.monthlyPlatformFee);
    this.transactionFeePercentage.setValue(tenant.pricing.transactionFeePercentage);
    this.durankiPercentage.setValue(tenant.pricing.durankiPercentage);
    this.tenantPercentage.setValue(tenant.pricing.tenantPercentage);
    this.communityPercentage.setValue(tenant.pricing.communityPercentage);
    this.partnerPercentage.setValue(tenant.pricing.partnerPercentage);
    this.tenantServiceCodes.set([...tenant.serviceCodes]);
    this.view.set('platform');
    this.notice.set(`${tenant.name} is loaded for editing.`);
    requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLElement>('.platform-page .form-panel');
      if (!editor) return;
      editor.scrollIntoView({ block: 'start', behavior: 'auto' });
      editor.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }

  clearTenantForm(): void {
    this.editingTenantId.set(null);
    this.tenantName.setValue('New Tenant');
    this.companyName.setValue('');
    this.registrationNumber.setValue('');
    this.contactPerson.setValue('');
    this.tenantEmail.setValue('');
    this.tenantTelephone.setValue('');
    this.tenantAddress.setValue('');
    this.tenantCountry.setValue('South Africa');
    this.tenantWebsite.setValue('');
    this.tenantSubdomain.setValue('');
    this.tenantStatus.setValue('Configured');
    this.tenantAdminName.setValue('');
    this.tenantAdminEmail.setValue('');
    this.tenantAdminTelephone.setValue('');
    this.tenantLogo.setValue('');
    this.primaryColor.setValue('#063a78');
    this.secondaryColor.setValue('#0a83e9');
    this.accentColor.setValue('#8be43b');
    this.heroImageUrl.setValue('');
    this.domainName.setValue('');
    this.websiteTitle.setValue('');
    this.mainHeading.setValue('');
    this.shortDescription.setValue('');
    this.aboutText.setValue('');
    this.socialLinks.setValue('');
    this.callToActionText.setValue('Get started');
    this.monthlyPlatformFee.setValue(0);
    this.transactionFeePercentage.setValue(0);
    this.durankiPercentage.setValue(10);
    this.tenantPercentage.setValue(70);
    this.communityPercentage.setValue(20);
    this.partnerPercentage.setValue(0);
    this.tenantServiceCodes.set([]);
  }

  createOrUpdateTenant(): void {
    const existingId = this.editingTenantId();
    const id = existingId ?? this.createId('tenant', this.tenantName.value);
    const tenant: Tenant = {
      id,
      name: this.tenantName.value.trim() || 'New Tenant',
      companyName: this.companyName.value.trim() || this.tenantName.value.trim(),
      registrationNumber: this.registrationNumber.value.trim(),
      contactPerson: this.contactPerson.value.trim(),
      email: this.tenantEmail.value.trim(),
      telephone: this.tenantTelephone.value.trim(),
      address: this.tenantAddress.value.trim(),
      country: this.tenantCountry.value.trim() || 'South Africa',
      website: this.tenantWebsite.value.trim() || this.domainName.value.trim(),
      subdomain: this.tenantSubdomain.value.trim() || `${id}.duranki.com`,
      status: this.tenantStatus.value,
      serviceCodes: this.normalizeServiceCodes(this.tenantServiceCodes()),
      tenantAdmin: {
        name: this.tenantAdminName.value.trim(),
        email: this.tenantAdminEmail.value.trim(),
        telephone: this.tenantAdminTelephone.value.trim()
      },
      branding: {
        logoUrl: this.tenantLogo.value.trim(),
        primaryColor: this.primaryColor.value,
        secondaryColor: this.secondaryColor.value,
        accentColor: this.accentColor.value,
        heroImageUrl: this.heroImageUrl.value.trim()
      },
      websiteConfig: {
        domainName: this.domainName.value.trim(),
        websiteTitle: this.websiteTitle.value.trim() || this.companyName.value.trim(),
        mainHeading: this.mainHeading.value.trim(),
        shortDescription: this.shortDescription.value.trim(),
        aboutText: this.aboutText.value.trim(),
        address: this.tenantAddress.value.trim(),
        email: this.tenantEmail.value.trim(),
        telephone: this.tenantTelephone.value.trim(),
        socialLinks: this.socialLinks.value.trim(),
        callToActionText: this.callToActionText.value.trim() || 'Get started'
      },
      pricing: {
        monthlyPlatformFee: Number(this.monthlyPlatformFee.value) || 0,
        transactionFeePercentage: Number(this.transactionFeePercentage.value) || 0,
        durankiPercentage: Number(this.durankiPercentage.value) || 0,
        tenantPercentage: Number(this.tenantPercentage.value) || 0,
        communityPercentage: Number(this.communityPercentage.value) || 0,
        partnerPercentage: Number(this.partnerPercentage.value) || 0
      },
      settings: { currency: 'ZAR', language: 'English', billingModel: 'Configured pricing and revenue share' }
    };

    this.tenants.update((tenants) =>
      existingId ? tenants.map((item) => (item.id === existingId ? tenant : item)) : [tenant, ...tenants]
    );
    this.communities.update((communities) =>
      communities.map((community) =>
        community.tenantId === tenant.id
          ? { ...community, serviceCodes: community.serviceCodes.filter((code) => tenant.serviceCodes.includes(code)) }
          : community
      )
    );
    this.selectedTenantId.set(tenant.id);
    this.editingTenantId.set(null);
    this.persist();
    if (existingId) {
      this.tenantInviteMessage.set('');
      this.notice.set(`${tenant.name} updated and available from the Duranki dashboard.`);
    } else {
      const temporaryPassword = this.createTemporaryPassword(tenant.name);
      this.tenantInviteMessage.set(this.createTenantInviteEmail(tenant, temporaryPassword));
      this.notice.set(`${tenant.name} created. Tenant administrator login details have been sent to ${tenant.tenantAdmin.email}.`);
    }
    this.view.set('tenant');
  }

  toggleTenantStatus(tenant: Tenant): void {
    this.tenants.update((tenants) =>
      tenants.map((item) =>
        item.id === tenant.id ? { ...item, status: item.status === 'Active' ? 'Inactive' : 'Active' } : item
      )
    );
    this.persist();
  }

  toggleCommunityStatus(community: Community): void {
    this.communities.update((communities) =>
      communities.map((item) =>
        item.id === community.id ? { ...item, status: item.status === 'Active' ? 'Inactive' : 'Active' } : item
      )
    );
    this.persist();
  }

  toggleTenantService(code: string): void {
    this.tenantServiceCodes.update((codes) =>
      codes.includes(code) ? codes.filter((item) => item !== code) : [...codes, code]
    );
  }

  toggleCommunityService(code: string): void {
    this.communityServiceCodes.update((codes) =>
      codes.includes(code) ? codes.filter((item) => item !== code) : [...codes, code]
    );
  }

  setTenantService(tenant: Tenant, code: string): void {
    const removing = tenant.serviceCodes.includes(code);
    this.tenants.update((tenants) =>
      tenants.map((item) =>
        item.id === tenant.id
          ? { ...item, serviceCodes: removing ? item.serviceCodes.filter((serviceCode) => serviceCode !== code) : [...item.serviceCodes, code] }
          : item
      )
    );
    if (removing) {
      this.communities.update((communities) =>
        communities.map((community) =>
          community.tenantId === tenant.id
            ? { ...community, serviceCodes: community.serviceCodes.filter((serviceCode) => serviceCode !== code) }
            : community
        )
      );
    }
    this.persist();
  }

  addServiceToCatalogue(): void {
    const name = this.newServiceName.value.trim();
    if (!name) {
      this.notice.set('Enter a service name before adding a future Duranki service.');
      return;
    }
    const service: DurankiService = {
      code: this.createId('service', name),
      name,
      category: this.newServiceCategory.value.trim() || 'Future services',
      description: this.newServiceDescription.value.trim() || 'Configurable Duranki service.',
      price: Number(this.newServicePrice.value) || 0,
      currency: 'ZAR',
      dashboardName: this.newServiceDashboardName.value.trim() || `${name} Dashboard`,
      dashboardRoute: this.newServiceDashboardRoute.value.trim() || this.createDashboardRoute(name),
      adminUsers: this.newServiceAdminName.value.trim()
        ? [{
            name: this.newServiceAdminName.value.trim(),
            email: this.newServiceAdminEmail.value.trim(),
            telephone: this.newServiceAdminTelephone.value.trim(),
            scope: 'Platform'
          }]
        : []
    };
    this.services.update((items) => [service, ...items]);
    this.newServiceName.setValue('');
    this.newServiceCategory.setValue('Future services');
    this.newServiceDescription.setValue('');
    this.newServicePrice.setValue(0);
    this.newServiceDashboardName.setValue('');
    this.newServiceDashboardRoute.setValue('');
    this.newServiceAdminName.setValue('');
    this.newServiceAdminEmail.setValue('');
    this.newServiceAdminTelephone.setValue('');
    this.persist();
    this.notice.set(`${service.name} added to the central Duranki service catalogue.`);
  }

  addServiceAdmin(): void {
    const serviceCode = this.adminServiceCode.value;
    const adminName = this.serviceAdminName.value.trim();
    const adminEmail = this.serviceAdminEmail.value.trim();
    if (!adminName || !adminEmail) {
      this.notice.set('Enter the service admin name and email before adding dashboard access.');
      return;
    }
    this.services.update((services) =>
      services.map((service) =>
        service.code === serviceCode
          ? {
              ...service,
              adminUsers: [
                ...service.adminUsers,
                {
                  name: adminName,
                  email: adminEmail,
                  telephone: this.serviceAdminTelephone.value.trim(),
                  scope: this.serviceAdminScope.value
                }
              ]
            }
          : service
      )
    );
    const serviceName = this.serviceName(serviceCode);
    this.serviceAdminName.setValue('');
    this.serviceAdminEmail.setValue('');
    this.serviceAdminTelephone.setValue('');
    this.persist();
    this.notice.set(`${adminName} can now administer the ${serviceName} dashboard.`);
  }

  createCommunity(): void {
    const tenant = this.selectedTenant();
    if (!tenant) return;
    const community: Community = {
      id: this.createId('community', this.communityName.value),
      tenantId: tenant.id,
      name: this.communityName.value.trim() || 'New Community',
      type: this.communityType.value,
      country: this.communityCountry.value.trim() || tenant.country,
      region: this.communityRegion.value.trim(),
      town: this.communityTown.value.trim(),
      logoUrl: this.communityLogo.value.trim(),
      administrator: this.communityAdministrator.value.trim(),
      contactDetails: this.communityContact.value.trim(),
      description: this.communityDescription.value.trim(),
      branding: {
        primaryColor: this.communityPrimaryColor.value,
        secondaryColor: this.communitySecondaryColor.value,
        accentColor: this.communityAccentColor.value,
        backgroundColor: this.communityBackgroundColor.value
      },
      status: this.communityStatus.value,
      serviceCodes: this.normalizeServiceCodes(this.communityServiceCodes()).filter((code) => tenant.serviceCodes.includes(code)),
      members: 0,
      users: 0,
      transactions: 0,
      projects: 0
    };
    this.communities.update((communities) => [community, ...communities]);
    this.selectedCommunityId.set(community.id);
    this.persist();
    this.notice.set(`${community.name} created under ${tenant.name}.`);
    this.view.set('community');
  }

  setCommunityService(community: Community, code: string): void {
    const tenant = this.tenants().find((item) => item.id === community.tenantId);
    if (!tenant?.serviceCodes.includes(code)) {
      this.notice.set('This service is not available to the parent tenant.');
      return;
    }
    this.communities.update((communities) =>
      communities.map((item) =>
        item.id === community.id
          ? { ...item, serviceCodes: item.serviceCodes.includes(code) ? item.serviceCodes.filter((serviceCode) => serviceCode !== code) : [...item.serviceCodes, code] }
          : item
      )
    );
    this.persist();
  }

  serviceName(code: string): string {
    return this.services().find((service) => service.code === code)?.name ?? code;
  }

  servicePrice(service: DurankiService): string {
    return 'Set in Service pricing';
  }

  serviceDashboard(service: DurankiService): string {
    return service.dashboardRoute || this.createDashboardRoute(service.name);
  }

  enabledServicesForTenant(tenant: Tenant): DurankiService[] {
    return this.services().filter((service) => tenant.serviceCodes.includes(service.code));
  }

  tenantForCommunity(community: Community): Tenant | undefined {
    return this.tenants().find((tenant) => tenant.id === community.tenantId);
  }

  tenantCommunityCount(tenantId: string): number {
    return this.communities().filter((community) => community.tenantId === tenantId).length;
  }

  tenantRevenue(tenantId: string): number {
    return this.communities().filter((community) => community.tenantId === tenantId).reduce((sum, community) => sum + community.transactions, 0);
  }

  tenantUsers(tenantId: string): number {
    return this.communities().filter((community) => community.tenantId === tenantId).reduce((sum, community) => sum + community.users, 0);
  }

  tenantHasService(tenantId: string, code: string): boolean {
    return this.tenants().find((tenant) => tenant.id === tenantId)?.serviceCodes.includes(code) ?? false;
  }

  communityTenantHasService(community: Community, code: string): boolean {
    return this.tenantHasService(community.tenantId, code);
  }

  revenueShareTotal(tenant: Tenant): number {
    return tenant.pricing.durankiPercentage + tenant.pricing.tenantPercentage + tenant.pricing.communityPercentage + tenant.pricing.partnerPercentage;
  }

  hasCommunityService(community: Community, code: string): boolean {
    return community.serviceCodes.includes(code);
  }

  grantTotal(): number {
    return this.grantDistributionBatches.reduce((sum, batch) => sum + batch.amount, 0);
  }

  grantPaidTotal(): number {
    return this.grantDistributionBatches.reduce((sum, batch) => sum + batch.paid, 0);
  }

  grantPendingTotal(): number {
    return this.grantTotal() - this.grantPaidTotal();
  }

  trainingCompletionRate(): number {
    const learners = this.uifTrainingModules.reduce((sum, module) => sum + module.learners, 0);
    const completed = this.uifTrainingModules.reduce((sum, module) => sum + module.completed, 0);
    return learners ? Math.round((completed / learners) * 100) : 0;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  openAccounting(): void {
    this.roles.setActiveRole('Accountant');
    void this.router.navigate(['/dashboard/accounting']);
  }

  private persist(): void {
    localStorage.setItem(this.tenantsKey, JSON.stringify(this.tenants()));
    localStorage.setItem(this.communitiesKey, JSON.stringify(this.communities()));
    localStorage.setItem(this.servicesKey, JSON.stringify(this.services()));
  }

  private readStored<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    } catch {
      return fallback;
    }
  }

  private normalizeTenant(rawTenant: Partial<Tenant> & { logoUrl?: string }): Tenant {
    const name = rawTenant.name ?? 'Tenant';
    const websiteConfig = rawTenant.websiteConfig ?? {
      domainName: rawTenant.website ?? rawTenant.subdomain ?? '',
      websiteTitle: rawTenant.companyName ?? name,
      mainHeading: `${name} powered by Duranki`,
      shortDescription: 'Tenant website generated from the standard Duranki website template.',
      aboutText: 'This tenant website is configured inside the Duranki platform.',
      address: rawTenant.address ?? '',
      email: rawTenant.email ?? '',
      telephone: rawTenant.telephone ?? '',
      socialLinks: '',
      callToActionText: 'Get started'
    };
    return {
      id: rawTenant.id ?? this.createId('tenant', name),
      name,
      companyName: rawTenant.companyName ?? name,
      registrationNumber: rawTenant.registrationNumber ?? '',
      contactPerson: rawTenant.contactPerson ?? '',
      email: rawTenant.email ?? '',
      telephone: rawTenant.telephone ?? '',
      address: rawTenant.address ?? websiteConfig.address ?? '',
      country: rawTenant.country ?? 'South Africa',
      website: rawTenant.website ?? websiteConfig.domainName ?? '',
      subdomain: rawTenant.subdomain ?? '',
      status: rawTenant.status ?? 'Configured',
      serviceCodes: this.normalizeServiceCodes(rawTenant.serviceCodes ?? []),
      tenantAdmin: rawTenant.tenantAdmin ?? { name: rawTenant.contactPerson ?? '', email: rawTenant.email ?? '', telephone: rawTenant.telephone ?? '' },
      branding: { ...defaultBranding, ...(rawTenant.branding ?? {}), logoUrl: rawTenant.branding?.logoUrl ?? rawTenant.logoUrl ?? '' },
      websiteConfig,
      pricing: { ...defaultPricing, ...(rawTenant.pricing ?? {}) },
      settings: rawTenant.settings ?? { currency: 'ZAR', language: 'English', billingModel: 'Configured pricing and revenue share' }
    };
  }

  private normalizeCommunity(rawCommunity: Partial<Community>): Community {
    return {
      id: rawCommunity.id ?? this.createId('community', rawCommunity.name ?? 'Community'),
      tenantId: rawCommunity.tenantId ?? this.tenants()[0]?.id ?? 'tenant-evolve',
      name: rawCommunity.name ?? 'Community',
      type: rawCommunity.type ?? 'General',
      country: rawCommunity.country ?? 'South Africa',
      region: rawCommunity.region ?? '',
      town: rawCommunity.town ?? '',
      logoUrl: rawCommunity.logoUrl ?? '',
      administrator: rawCommunity.administrator ?? '',
      contactDetails: rawCommunity.contactDetails ?? '',
      description: rawCommunity.description ?? '',
      branding: {
        ...this.communityBrandingForTenant(rawCommunity.tenantId ?? this.tenants()[0]?.id),
        ...(rawCommunity.branding ?? {})
      },
      status: rawCommunity.status ?? 'Active',
      serviceCodes: this.normalizeServiceCodes(rawCommunity.serviceCodes ?? []),
      members: rawCommunity.members ?? 0,
      users: rawCommunity.users ?? rawCommunity.members ?? 0,
      transactions: rawCommunity.transactions ?? 0,
      projects: rawCommunity.projects ?? 0
    };
  }

  private ensureDefaultTenants(storedTenants: Partial<Tenant>[]): Tenant[] {return communityHierarchy(durankiCleanTenants(storedTenants,defaultTenants), []).tenants.map(value=>this.normalizeTenant(value));}

  private ensureDefaultCommunities(storedCommunities: Partial<Community>[]): Community[] {return communityHierarchy([], durankiCleanCommunities(storedCommunities,defaultCommunities)).communities.map(value=>this.normalizeCommunity(value));}

  private createId(prefix: string, value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'item';
    return `${prefix}-${slug}-${Date.now().toString(36)}`;
  }

  private createDashboardRoute(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'service';
    return `/dashboard/services/${slug}`;
  }

  private createTemporaryPassword(value: string): string {
    const stem = value.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'Tenant';
    return `${stem}@${Math.floor(1000 + Math.random() * 9000)}`;
  }

  private applyTenantColorsToCommunityForm(tenant: Tenant): void {
    this.communityPrimaryColor.setValue(tenant.branding.primaryColor);
    this.communitySecondaryColor.setValue(tenant.branding.secondaryColor);
    this.communityAccentColor.setValue(tenant.branding.accentColor);
    this.communityBackgroundColor.setValue('#f3f9fd');
  }

  private createTenantInviteEmail(tenant: Tenant, temporaryPassword: string): string {
    const loginUrl = tenant.subdomain ? `https://${tenant.subdomain}/login` : 'https://platform.duranki.com/login';
    return [
      `To: ${tenant.tenantAdmin.email || tenant.email}`,
      `Subject: Your ${tenant.name} Duranki tenant login details`,
      '',
      `Hello ${tenant.tenantAdmin.name || tenant.contactPerson || 'Tenant Administrator'},`,
      '',
      `Your Duranki tenant has been created for ${tenant.companyName}.`,
      `Login URL: ${loginUrl}`,
      `Username: ${tenant.tenantAdmin.email || tenant.email}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      'After logging in, please configure your tenant services, website, branding, pricing, communities and users.',
      '',
      'Duranki Platform'
    ].join('\n');
  }

  private normalizeServiceCodes(codes: string[]): string[] {
    return [...new Set(codes.map((code) => serviceCodeAliases[code] ?? code))];
  }

  private normalizeServices(rawServices: Partial<DurankiService>[]): DurankiService[] {
    const byCode = new Map(defaultServices.map((service) => [service.code, service]));
    rawServices.forEach((service) => {
      if (!service.code || !service.name) return;
      const code = serviceCodeAliases[service.code] ?? service.code;
      byCode.set(code, {
        code,
        name: service.name,
        category: service.category ?? 'Future services',
        description: service.description ?? 'Configurable Duranki service.',
        price: Number(service.price) || byCode.get(code)?.price || 0,
        currency: service.currency ?? byCode.get(code)?.currency ?? 'ZAR',
        dashboardName: service.dashboardName ?? byCode.get(code)?.dashboardName ?? `${service.name} Dashboard`,
        dashboardRoute: service.dashboardRoute ?? byCode.get(code)?.dashboardRoute ?? this.createDashboardRoute(service.name),
        adminUsers: service.adminUsers ?? byCode.get(code)?.adminUsers ?? []
      });
    });
    return [...byCode.values()];
  }

  private communityBrandingForTenant(tenantId: string | undefined): Community['branding'] {
    const tenant = this.tenants().find((item) => item.id === tenantId);
    return {
      ...defaultCommunityBranding,
      primaryColor: tenant?.branding.primaryColor ?? defaultCommunityBranding.primaryColor,
      secondaryColor: tenant?.branding.secondaryColor ?? defaultCommunityBranding.secondaryColor,
      accentColor: tenant?.branding.accentColor ?? defaultCommunityBranding.accentColor
    };
  }

  private isDeprecatedVumaTenant(tenant: Tenant): boolean {
    return tenant.id === 'tenant-vuma-force' || tenant.name.trim().toLowerCase() === 'vuma force';
  }

  private isDeprecatedVumaCommunity(community: Community): boolean {
    return community.tenantId === 'tenant-vuma-force' || community.id === 'community-shopbox';
  }
}


function durankiArchiveUi(key: string, rows: any): void {
  const archive = 'duranki_cleanup_archive_v1_' + key;
  if (!localStorage.getItem(archive)) localStorage.setItem(archive, JSON.stringify(rows));
}
function durankiCleanTenants(rows: any[], defaults: any[]): any[] {
  const samples: any[] = [{"id":"tenant-ingwe-connect","name":"Ingwe Connect","companyName":"Ingwe Connect","registrationNumber":"","contactPerson":"","email":"","telephone":"","address":"","country":"South Africa","website":"","subdomain":"","status":"Configured","serviceCodes":[],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"","primaryColor":"#171717","secondaryColor":"#caa33d","accentColor":"#f4d878","heroImageUrl":""},"websiteConfig":{"domainName":"","websiteTitle":"Ingwe Connect","mainHeading":"Ingwe Connect","shortDescription":"","aboutText":"","address":"","email":"","telephone":"","socialLinks":"","callToActionText":"Get started"},"pricing":{"monthlyPlatformFee":0,"transactionFeePercentage":0,"durankiPercentage":0,"tenantPercentage":0,"communityPercentage":0,"partnerPercentage":0},"settings":{"currency":"ZAR","language":"English","billingModel":"Not configured"}},{"id":"tenant-inkolo","name":"Inkolo","companyName":"Inkolo Communities","registrationNumber":"INK-2026-003","contactPerson":"","email":"","telephone":"","address":"Durban, KwaZulu-Natal","country":"South Africa","website":"https://inkolo.duranki.com","subdomain":"inkolo.duranki.com","status":"Active","serviceCodes":["marketplace","jobs","wallet","payments","airtime","utilities","vuma-fibre","insurance","education","funeral-cover","projects"],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"/inkolo-connect-logo.png","primaryColor":"#062d6b","secondaryColor":"#087ce8","accentColor":"#58c91a","heroImageUrl":""},"websiteConfig":{"domainName":"www.inkolo.co.za","websiteTitle":"Inkolo Communities","mainHeading":"Connected services for faith and community networks","shortDescription":"Inkolo uses Duranki to manage communities, members, services, payments, projects and communication.","aboutText":"Inkolo is a tenant inside the Duranki platform. Its communities sit underneath Inkolo and receive only the services enabled for that tenant.","address":"Durban, KwaZulu-Natal","email":"","telephone":"","socialLinks":"@inkolo","callToActionText":"Join Inkolo"},"pricing":{"monthlyPlatformFee":2500,"transactionFeePercentage":2.5,"durankiPercentage":15,"tenantPercentage":55,"communityPercentage":25,"partnerPercentage":5},"settings":{"currency":"ZAR","language":"English","billingModel":"Tenant fee plus community service revenue share"}},{"id":"tenant-evolve","name":"Evolve","companyName":"Evolve Digital Communities","registrationNumber":"EV-2026-001","contactPerson":"","email":"","telephone":"","address":"Johannesburg, Gauteng","country":"South Africa","website":"https://evolve.duranki.com","subdomain":"evolve.duranki.com","status":"Active","serviceCodes":["marketplace","jobs","wallet","payments","education","internet","projects"],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"","primaryColor":"#063a78","secondaryColor":"#1282d8","accentColor":"#8be43b","heroImageUrl":""},"websiteConfig":{"domainName":"www.evolve.co.za","websiteTitle":"Evolve Digital Communities","mainHeading":"Digital services for connected communities","shortDescription":"Evolve uses Duranki to bring marketplace, jobs, payments, education and internet services into local communities.","aboutText":"Evolve builds trusted digital community ecosystems with services that can be activated per community.","address":"Johannesburg, Gauteng","email":"","telephone":"","socialLinks":"facebook.com/evolve","callToActionText":"Join Evolve"},"pricing":{"monthlyPlatformFee":2500,"transactionFeePercentage":2.5,"durankiPercentage":10,"tenantPercentage":60,"communityPercentage":25,"partnerPercentage":5},"settings":{"currency":"ZAR","language":"English","billingModel":"Tenant fee plus transaction share"}},{"id":"tenant-trader-connect","name":"Trader Connect","companyName":"Trader Connect Communities","registrationNumber":"TC-2026-004","contactPerson":"","email":"","telephone":"","address":"Durban, KwaZulu-Natal","country":"South Africa","website":"https://traderconnect.duranki.com","subdomain":"traderconnect.duranki.com","status":"Active","serviceCodes":["marketplace","jobs","wallet","payments","community-membership","airtime","utilities","vuma-fibre","education","grant-distribution","trader-training","funeral-cover","deliveries","business-services","pos","projects"],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"/trader-connect-logo.png","primaryColor":"#063f91","secondaryColor":"#0a83e9","accentColor":"#58c91a","heroImageUrl":""},"websiteConfig":{"domainName":"www.traderconnect.co.za","websiteTitle":"Trader Connect","mainHeading":"Connect, trade and grow with businesses around you","shortDescription":"Trader Connect uses Duranki to organise trader communities by district and block with marketplace, wallet, jobs, utilities, transport, fibre, referrals, training and protection services.","aboutText":"Trader Connect is a Duranki tenant for local traders. It helps verified traders find each other, activate business services, share local opportunities and communicate inside district and block communities.","address":"Durban, KwaZulu-Natal","email":"","telephone":"","socialLinks":"@traderconnect","callToActionText":"Join Trader Connect"},"pricing":{"monthlyPlatformFee":2500,"transactionFeePercentage":2.5,"durankiPercentage":12,"tenantPercentage":58,"communityPercentage":25,"partnerPercentage":5},"settings":{"currency":"ZAR","language":"English","billingModel":"Tenant fee plus trader service revenue share"}},{"id":"tenant-zuc","name":"ZUC","companyName":"ZUC","registrationNumber":"ZUC-2026-005","contactPerson":"","email":"","telephone":"","address":"South Africa","country":"South Africa","website":"https://www.zuc.co.za","subdomain":"zuc.co.za","status":"Configured","serviceCodes":["marketplace","jobs","wallet","payments","airtime","utilities","internet","education","projects"],"tenantAdmin":{"name":"","email":"","telephone":""},"branding":{"logoUrl":"/zuc-logo.png","primaryColor":"#1c4b82","secondaryColor":"#2f9f7b","accentColor":"#f3c744","heroImageUrl":""},"websiteConfig":{"domainName":"www.zuc.co.za","websiteTitle":"ZUC","mainHeading":"ZUC powered by Duranki","shortDescription":"ZUC is configured as a tenant inside the Duranki platform and can activate services for its communities.","aboutText":"ZUC can manage communities, users, services, transactions and reports through its own Duranki tenant dashboard.","address":"South Africa","email":"","telephone":"","socialLinks":"@zuc","callToActionText":"Join ZUC"},"pricing":{"monthlyPlatformFee":2500,"transactionFeePercentage":2.5,"durankiPercentage":10,"tenantPercentage":60,"communityPercentage":25,"partnerPercentage":5},"settings":{"currency":"ZAR","language":"English","billingModel":"Configured pricing and revenue share"}}];
  durankiArchiveUi('tenants', rows);
  const cleaned = rows.filter(t => t.id !== 'tenant-evolve').map(t => {
    const sample = samples.find(s => s.id === t.id);
    const clean = defaults.find(s => s.id === t.id);
    if (!sample || !clean) return t;
    const next = {...t};
    for (const key of ['companyName','registrationNumber','contactPerson','email','telephone','address','website','subdomain','tenantAdmin','pricing','settings','websiteConfig']) {
      if (JSON.stringify(next[key]) === JSON.stringify(sample[key])) next[key] = clean[key];
    }
    return next;
  });
  for (const value of defaults) if (!cleaned.some(t => t.id === value.id || t.name?.trim().toLowerCase() === value.name.toLowerCase())) cleaned.push(value);
  return cleaned;
}
function durankiCleanCommunities(rows: any[], defaults: any[]): any[] {
  const removed = ["community-inkolo-kzn","community-inkolo-gauteng","community-asmara","community-eritrea","community-trader-ethekwini-central","community-trader-kwamashu","community-trader-umlazi","community-trader-pinetown"];
  durankiArchiveUi('communities', rows);
  const cleaned = rows.filter(c => !removed.includes(c.id) && c.tenantId !== 'tenant-evolve').map(c => ({...c, members:0,users:0,transactions:0,projects:0}));
  for (const value of defaults) if (!cleaned.some(c => c.id === value.id)) cleaned.push(value);
  return cleaned;
}
function durankiRefreshDirectory(owner: any): void {
  const token = sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token');
  if (!token) return;
  fetch('/api/platform/admin/import-directory',{headers:{Authorization:'Bearer '+token},cache:'no-store'})
    .then(response => {if(!response.ok) throw new Error('Directory unavailable'); return response.json();})
    .then(data => {
      owner.platformUsers.set(data.users);
      owner.communities.update((rows: any[]) => rows.map(c => {
        const record = data.communities.find((x: any) => (x.platformCommunityId || x.id) === c.id);
        return {...c, users:record?.users || 0, members:record?.users || 0};
      }));
    }).catch(() => owner.notice.set('Member totals could not be loaded.'));
}
import { communityHierarchy } from '../../../../../public/community-hierarchy';
