import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, ServiceSubscription, User } from './auth.service';
import { ProfileModalComponent } from './profile-modal.component';
import { RoleSwitcherComponent } from './shared/components/role-switcher/role-switcher.component';
import {
  Church,
  ChurchBranch,
  CommunityBranding,
  MemberCommunity
} from './core/models/member-community.model';
import { MemberCommunityService } from './core/services/member-community.service';
import {
  DailyScripture,
  DailyScriptureService
} from './core/services/daily-scripture.service';
import {
  CommunityMemberContact,
  DirectMemberMessage,
  MemberCommunicationService
} from './core/services/member-communication.service';
import { ProfileService } from './profile.service';

interface ChurchEvent {
  day: string;
  month: string;
  title: string;
  time: string;
  location: string;
  description: string;
}

interface CommunityChatMessage {
  author: string;
  initials: string;
  message: string;
  time: string;
  mine?: boolean;
}

interface CommunityActiveService extends ServiceSubscription {
  name: string;
  image: string;
  accent: string;
}

interface ConfiguredCommunity {
  id?: string;
  name?: string;
  type?: string;
  serviceCodes?: string[];
}

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [ReactiveFormsModule, ProfileModalComponent, RoleSwitcherComponent],
  templateUrl: './community.component.html',
  styleUrl: './community.component.css'
})
export class CommunityComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly communities = inject(MemberCommunityService);
  private readonly scriptures = inject(DailyScriptureService);
  private readonly memberCommunication = inject(MemberCommunicationService);
  private readonly platformCommunitiesKey = 'duranki_platform_communities';
  readonly profiles = inject(ProfileService);

  readonly user = signal<User | null>(null);
  readonly profileOpen = signal(false);
  readonly subscriptions = signal<ServiceSubscription[]>([]);
  readonly walletOpen = signal(false);
  readonly walletBrandLogo = signal('');
  readonly walletBrandName = signal('Duranki');
  readonly openingService = signal<{
    serviceCode: string;
    name: string;
    image: string;
  } | null>(null);
  readonly kznccChurches = signal<Church[]>([]);
  readonly churchBranches = signal<ChurchBranch[]>([]);
  readonly memberCommunity = signal<MemberCommunity | null>(null);
  readonly churchSelection = new FormControl('', { nonNullable: true });
  readonly branchSelection = new FormControl('', { nonNullable: true });
  readonly churchLinkedMessage = signal('');
  readonly dailyScripture = signal<DailyScripture>(this.scriptures.getToday());
  readonly traderInsights = [
    'Stock moves faster when your records are clear and your next order is planned.',
    'A good trader watches cash flow every day, not only when stock runs out.',
    'Small daily sales records help prove business activity when funding is reviewed.',
    'Know your best seller, your slowest stock and the margin on each item.',
    'Separate household money from trading money so growth is easier to measure.',
    'Reliable suppliers, fair prices and visible products build repeat customers.',
    'A trader who reconciles daily can spot mistakes before they become losses.',
    'Use your grant for stock, tools and growth items that improve turnover.',
    'Keep proof of purchases, sales and payouts ready for reconciliation.',
    'Consistent service turns one customer into a community of customers.'
  ];
  readonly chatMessage = new FormControl('', { nonNullable: true });
  readonly memberSearch = new FormControl('', { nonNullable: true });
  readonly directMessage = new FormControl('', { nonNullable: true });
  readonly memberSearchResults = signal<CommunityMemberContact[]>([]);
  readonly directContacts = signal<CommunityMemberContact[]>([]);
  readonly selectedDirectMember = signal<CommunityMemberContact | null>(null);
  readonly directMessages = signal<DirectMemberMessage[]>([]);
  readonly directCommunicationNotice = signal('');
  readonly chatMessages = signal<CommunityChatMessage[]>([
    {
      author: 'Nandi M.',
      initials: 'NM',
      message: 'Morning everyone. Please remember the family food drive this month.',
      time: '09:14'
    },
    {
      author: 'Thabo K.',
      initials: 'TK',
      message: 'Thank you. I will bring a grocery parcel on Sunday.',
      time: '09:18'
    }
  ]);
  readonly announcements = [
    {
      category: 'Church',
      title: 'New Born Church monthly gathering',
      summary: 'Join members for worship, updates and upcoming community opportunities.',
      date: '14 June',
      featured: true
    },
    {
      category: 'Community',
      title: 'Family food drive',
      summary: 'Bring non-perishable goods to the church reception before 27 June.',
      date: '27 June'
    },
    {
      category: 'Youth',
      title: 'Youth fellowship registration',
      summary: 'Young members can register at the church office after Sunday service.',
      date: '20 June'
    }
  ];
  readonly serviceDetails: Record<string, { name: string; image: string; accent: string }> = {
    'build-up-balance': { name: 'Buy and Sell', image: '/service-buy-and-sell.png', accent: '#248fe5' },
    marketplace: { name: 'Buy and Sell', image: '/service-buy-and-sell.png', accent: '#248fe5' },
    funeral: { name: 'Funeral Services', image: '/service-funeral-general.png', accent: '#2d963d' },
    'funeral-cover': { name: 'Funeral Services', image: '/service-funeral-general.png', accent: '#2d963d' },
    community: { name: 'My Community', image: '/service-community.png', accent: '#58c91a' },
    referral: { name: 'Referral', image: '/service-referral.png', accent: '#16a34a' },
    'job-search': { name: 'Job Search', image: '/service-job-search.png', accent: '#1685ea' },
    jobs: { name: 'Jobs & Gigs', image: '/service-job-search.png', accent: '#1685ea' },
    'vas-services': { name: 'VAS Services', image: '/service-vas.png', accent: '#58c91a' },
    airtime: { name: 'Airtime & Data', image: '/service-vas.png', accent: '#58c91a' },
    utilities: { name: 'Utilities', image: '/service-vas.png', accent: '#58c91a' },
    payments: { name: 'Payments', image: '/service-my-wallet.png', accent: '#087ce8' },
    eduu: { name: 'EduU', image: '/service-education.png', accent: '#087ce8' },
    education: { name: 'EduU', image: '/service-education.png', accent: '#087ce8' },
    'grant-distribution': { name: 'Grant Distribution', image: '/duranki-up-logo.png', accent: '#16a34a' },
    'trader-training': { name: 'Trader Training', image: '/service-education.png', accent: '#087ce8' },
    'uif-trader-training': { name: 'Trader Training', image: '/service-education.png', accent: '#087ce8' },
    'community-membership': { name: 'Community Membership', image: '/service-community.png', accent: '#12385f' },
    membership: { name: 'Community Membership', image: '/service-community.png', accent: '#12385f' },
    'vuma-fibre': { name: 'Vuma Force', image: '/service-vuma-fibre.png', accent: '#8c2be2' },
    internet: { name: 'Vuma Force', image: '/service-vuma-fibre.png', accent: '#8c2be2' },
    'catch-a-ride': { name: 'Catch a Lift', image: '/service-catch-a-lift.png', accent: '#48b824' },
    transport: { name: 'Catch a Lift', image: '/service-catch-a-lift.png', accent: '#48b824' },
    deliveries: { name: 'Deliveries', image: '/service-catch-a-lift.png', accent: '#48b824' },
    kzncc: { name: 'KZNCC', image: '/service-kzncc.png', accent: '#087ce8' },
    'keycha-properties': { name: 'Keytcha Properties', image: '/service-keycha-properties.png', accent: '#48b824' },
    'business-services': { name: 'Business Services', image: '/service-buy-and-sell.png', accent: '#248fe5' },
    projects: { name: 'Projects', image: '/duranki-up-logo.png', accent: '#16a34a' },
    loans: { name: 'Loans', image: '/service-my-wallet.png', accent: '#087ce8' },
    pos: { name: 'POS', image: '/service-my-wallet.png', accent: '#087ce8' },
    wallet: { name: 'My Wallet', image: '/service-my-wallet.png', accent: '#087ce8' }
  };
  readonly communityShortcutCodes = [
    'wallet',
    'community-membership',
    'grant-distribution',
    'trader-training',
    'marketplace',
    'jobs',
    'payments',
    'airtime',
    'utilities',
    'referral',
    'build-up-balance',
    'keycha-properties',
    'catch-a-ride',
    'job-search',
    'kzncc',
    'vuma-fibre',
    'vas-services'
  ];
  readonly church = {
    name: 'The New Born Church',
    denomination: 'A welcoming faith community',
    address: '12 Community Road, Tugela',
    phone: '+27 00 000 0000',
    email: 'church@inkoloconnect.local',
    nextMass: {
      date: 'Sunday, 14 June 2026',
      time: '09:00',
      type: 'Sunday Mass',
      location: 'Main Church Hall',
      address: '12 Community Road, Tugela'
    },
    pastor: {
      name: 'Pastor Themba Mokoena',
      role: 'Lead Pastor',
      message: 'We look forward to welcoming every family to worship and fellowship together.'
    }
  };

  readonly events: ChurchEvent[] = [
    {
      day: '17',
      month: 'JUN',
      title: 'Midweek Prayer Gathering',
      time: '18:00',
      location: 'Prayer Room',
      description: 'A quiet evening of prayer, reflection and community support.'
    },
    {
      day: '20',
      month: 'JUN',
      title: 'Youth Fellowship',
      time: '14:00',
      location: 'Community Hall',
      description: 'Music, activities and a message for young community members.'
    },
    {
      day: '27',
      month: 'JUN',
      title: 'Family Food Drive',
      time: '10:00',
      location: 'Church Courtyard',
      description: 'Bring non-perishable goods to support families in our community.'
    }
  ];

  ngOnInit(): void {
    this.profiles.load().subscribe();
    this.auth.getProfile().subscribe({
      next: (user) => {
        this.user.set(user);
        this.loadWalletBranding(user.id);
        this.loadDirectContacts();
        this.loadSelectedMemberCommunity(user.id);
      },
      error: () => this.logout()
    });
    this.loadSubscriptions();
    this.communities.getActiveChurches().subscribe((churches) =>
      this.kznccChurches.set(churches)
    );
  }

  private loadSubscriptions(): void {
    this.auth.getSubscriptions().subscribe({
      next: (subscriptions) => this.subscriptions.set(subscriptions)
    });
  }

  selectedKznccChurch(): Church | undefined {
    return this.kznccChurches().find(
      ({ id }) => id === this.memberCommunity()?.churchId
    );
  }

  private loadSelectedMemberCommunity(userId: number): void {
    this.communities.getMemberCommunities().subscribe({
      next: (communities) => {
        const requestedCommunityId = this.route.snapshot.queryParamMap.get('communityId');
        const community =
          communities.find((item) => item.churchId === requestedCommunityId) ??
          communities[0] ??
          null;
        this.setMemberCommunity(community);
      },
      error: () => {
        this.communities.getMemberCommunity(String(userId)).subscribe((community) =>
          this.setMemberCommunity(community)
        );
      }
    });
  }

  private setMemberCommunity(community: MemberCommunity | null): void {
    this.memberCommunity.set(community);
    this.churchSelection.setValue(community?.churchId ?? '');
    this.branchSelection.setValue(community?.branchId ?? '');
    this.loadBranches(false);
  }

  communityBranding(): CommunityBranding {
    return this.selectedKznccChurch()?.branding ?? {
      primaryColor: '#062d6b',
      secondaryColor: '#087ce8',
      accentColor: '#58c91a',
      backgroundColor: '#f2f8ff'
    };
  }

  communityHeading(): string {
    return this.communities.getCommunityHeading(this.memberCommunity());
  }

  isChurchCommunity(): boolean {
    const configuredCommunity = this.currentConfiguredCommunity();
    const communityType = configuredCommunity?.type?.toLowerCase();
    if (communityType) {
      return communityType === 'church';
    }

    const communityName = this.normalizeCommunityName(
      `${this.memberCommunity()?.churchName ?? ''} ${this.communityHeading()}`
    );
    return !/(trader|business|market|retail|merchant|vendor|isp)/.test(communityName);
  }

  dailyCommunityLabel(): string {
    return this.isChurchCommunity()
      ? `DAILY SCRIPTURE - DAY ${this.dailyScripture().day} OF 360`
      : `DAILY TRADER INSIGHT - DAY ${this.dailyTradingDay()} OF 360`;
  }

  dailyCommunityText(): string {
    if (this.isChurchCommunity()) {
      return this.dailyScripture().text;
    }

    return this.traderInsights[(this.dailyTradingDay() - 1) % this.traderInsights.length];
  }

  dailyCommunityReference(): string {
    return this.isChurchCommunity()
      ? this.dailyScripture().reference
      : 'Duranki Trader Connect';
  }

  canSelfChangeCommunity(): boolean {
    return (this.memberCommunity()?.selfChangeCount ?? 0) < 1;
  }

  communityChangeEmailLink(): string {
    const user = this.user();
    const subject = 'Duranki community change request';
    const body = [
      'Hello Duranki Admin,',
      '',
      'Please assist me to change my registered church or community.',
      `Member: ${user ? `${user.firstName} ${user.lastName}` : ''}`,
      `Current community: ${this.communityHeading()}`,
      '',
      'Reason for change:',
      ''
    ].join('\n');
    return `mailto:admin@duranki.co.za?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  onChurchSelectionChange(): void {
    this.branchSelection.setValue('');
    this.churchLinkedMessage.set('');
    this.loadBranches(true);
  }

  confirmPrimaryChurch(): void {
    const churchId = this.churchSelection.value;
    const branchId = this.branchSelection.value;

    if (!churchId) {
      this.churchLinkedMessage.set('Please select a church.');
      return;
    }
    if (this.churchBranches().length > 0 && !branchId) {
      this.churchLinkedMessage.set('Please select a church branch.');
      return;
    }

    this.communities
      .subscribeMemberToCommunity(
        String(this.user()?.id ?? ''),
        churchId,
        branchId || undefined
      )
      .subscribe({
        next: (community) => {
          this.memberCommunity.set(community);
          this.churchLinkedMessage.set(
            'Your community is confirmed. You can now choose and apply for Duranki services.'
          );
          void this.router.navigate(['/dashboard/member'], {
            queryParams: { from: 'community' }
          });
        },
        error: ({ error }) => {
          this.churchLinkedMessage.set(
            error?.message ?? 'Your community could not be confirmed.'
          );
        }
      });
  }

  changeCommunity(): void {
    if (this.canSelfChangeCommunity()) {
      this.communities.resetMemberCommunityChoice().subscribe({
        next: ({ message }) => {
          this.churchLinkedMessage.set(message);
          this.logout();
        },
        error: ({ error }) =>
          this.churchLinkedMessage.set(
            error?.message ?? 'Your community could not be unlocked.'
          )
      });
      return;
    }

    this.communities.requestMemberCommunityChange().subscribe({
      next: ({ message }) => this.churchLinkedMessage.set(message),
      error: ({ error }) =>
        this.churchLinkedMessage.set(
          error?.message ?? 'Your request could not be sent to Duranki Admin.'
        )
    });
  }

  private loadBranches(clearSelection: boolean): void {
    const churchId = this.churchSelection.value;
    if (!churchId) {
      this.churchBranches.set([]);
      return;
    }
    this.communities.getBranchesByChurch(churchId).subscribe((branches) => {
      this.churchBranches.set(branches);
      if (clearSelection) {
        this.branchSelection.setValue('');
      }
    });
  }

  activeServices(): CommunityActiveService[] {
    return this.subscriptions()
      .filter((subscription) => subscription.status === 'active')
      .filter((subscription) => this.serviceIsEnabledForMemberCommunity(subscription.serviceCode))
      .map((subscription) => ({
        ...subscription,
        ...(this.serviceDetails[subscription.serviceCode] ?? {
          name: subscription.planLabel,
          image: '/duranki-up-logo.png',
          accent: '#087ce8'
        }),
        name:
          subscription.serviceCode === 'community'
            ? this.communityHeading()
            : this.serviceDetails[subscription.serviceCode]?.name ??
              subscription.planLabel
      }));
  }

  communityShortcutServices() {
    const activeByCode = new Map<string, CommunityActiveService>();
    this.activeServices().forEach((service) => {
      this.platformServiceCodes(service.serviceCode).forEach((code) =>
        activeByCode.set(code, service)
      );
    });

    const seen = new Set<string>();
    return this.communityShortcutCodes
      .map((serviceCode) => activeByCode.get(serviceCode))
      .filter((service): service is CommunityActiveService => {
        if (!service || seen.has(service.serviceCode)) return false;
        seen.add(service.serviceCode);
        return true;
      });
  }

  private serviceIsEnabledForMemberCommunity(serviceCode: string): boolean {
    if (serviceCode === 'community') return true;
    const memberCommunity = this.memberCommunity();
    if (!memberCommunity?.churchName && !memberCommunity?.churchId) return true;
    const configuredCommunity = this.configuredCommunityForMember(memberCommunity);
    if (!configuredCommunity) return true;
    const communityServiceCodes = configuredCommunity.serviceCodes ?? [];
    return this.platformServiceCodes(serviceCode).some((code) =>
      communityServiceCodes.includes(code)
    );
  }

  private currentConfiguredCommunity(): ConfiguredCommunity | null {
    const memberCommunity = this.memberCommunity();
    if (!memberCommunity) return null;
    return this.configuredCommunityForMember(memberCommunity);
  }

  private configuredCommunityForMember(memberCommunity: MemberCommunity): ConfiguredCommunity | null {
    let communities: ConfiguredCommunity[];
    try {
      communities = JSON.parse(localStorage.getItem(this.platformCommunitiesKey) || '[]');
    } catch {
      return null;
    }
    if (!Array.isArray(communities) || communities.length === 0) return null;

    const memberNames = [
      memberCommunity.churchName,
      memberCommunity.branchName,
      this.communities.getCommunityHeading(memberCommunity)
    ].map((value) => this.normalizeCommunityName(value ?? ''));
    const memberIds = new Set([
      memberCommunity.churchId,
      memberCommunity.branchId
    ].filter(Boolean));

    return communities.find((community) =>
      memberIds.has(community.id ?? '') ||
      memberNames.includes(this.normalizeCommunityName(community.name ?? ''))
    ) ?? null;
  }

  private normalizeCommunityName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private dailyTradingDay(): number {
    const start = new Date(new Date().getFullYear(), 0, 0);
    const diff = Date.now() - start.getTime();
    return Math.max(1, Math.floor(diff / 86400000));
  }

  private platformServiceCodes(serviceCode: string): string[] {
    const aliases: Record<string, string[]> = {
      'build-up-balance': ['build-up-balance', 'marketplace'],
      marketplace: ['marketplace', 'build-up-balance'],
      'job-search': ['job-search', 'jobs'],
      jobs: ['jobs', 'job-search'],
      'vas-services': ['vas-services', 'airtime', 'utilities'],
      airtime: ['airtime', 'vas-services'],
      utilities: ['utilities', 'vas-services'],
      payments: ['payments', 'wallet'],
      'catch-a-ride': ['catch-a-ride', 'deliveries', 'transport'],
      transport: ['transport', 'catch-a-ride'],
      deliveries: ['deliveries', 'catch-a-ride'],
      funeral: ['funeral', 'funeral-cover'],
      'funeral-cover': ['funeral-cover', 'funeral'],
      eduu: ['eduu', 'education'],
      education: ['education', 'eduu'],
      'vuma-fibre': ['vuma-fibre', 'vuma', 'internet'],
      internet: ['internet', 'vuma-fibre'],
      'uif-trader-training': ['uif-trader-training', 'trader-training'],
      'trader-training': ['trader-training', 'uif-trader-training'],
      'community-membership': ['community-membership', 'membership'],
      membership: ['membership', 'community-membership']
    };
    return aliases[serviceCode] ?? [serviceCode];
  }

  openServiceFromCommunity(service: {
    serviceCode: string;
    name: string;
    image: string;
  }): void {
    if (service.serviceCode === 'community') {
      return;
    }

    if (service.serviceCode === 'vuma-fibre') {
      void this.router.navigate(['/dashboard/member'], {
        queryParams: {
          from: 'community',
          service: 'vuma-fibre',
          communityId: this.memberCommunity()?.churchId ?? undefined
        }
      });
      return;
    }

    this.openingService.set(service);
    void this.router.navigate(['/dashboard/member'], {
      queryParams: {
        from: 'community',
        service: service.serviceCode,
        communityId: this.memberCommunity()?.churchId ?? undefined
      }
    });
  }

  handleActiveServiceClick(
    event: Event,
    service: {
      serviceCode: string;
      name: string;
      image: string;
    }
  ): void {
    if (service.serviceCode === 'community') {
      return;
    }
    event.preventDefault();
    this.openServiceFromCommunity(service);
  }

  subscriptionPrice(subscription: ServiceSubscription): string {
    return subscription.amountCents === 0
      ? 'Free'
      : `R${(subscription.amountCents / 100).toFixed(2)} / month`;
  }

  hasWallet(): boolean {
    return this.subscriptions().some(
      (subscription) => subscription.serviceCode === 'wallet' && subscription.status === 'active'
    );
  }

  private loadWalletBranding(userId: number): void {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`inkolo_wallet_brand_${userId}`) ?? 'null'
      );
      this.walletBrandLogo.set(String(saved?.logo ?? ''));
      this.walletBrandName.set(String(saved?.team ?? 'Duranki'));
    } catch {
      this.walletBrandLogo.set('');
      this.walletBrandName.set('Duranki');
    }
  }

  sendMessage(): void {
    const message = this.chatMessage.value.trim();
    const user = this.user();

    if (!message || !user) {
      return;
    }

    this.chatMessages.update((messages) => [
      ...messages,
      {
        author: `${user.firstName} ${user.lastName}`,
        initials: `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`,
        message,
        time: new Intl.DateTimeFormat('en', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date()),
        mine: true
      }
    ]);
    this.chatMessage.setValue('');
  }

  searchCommunityMembers(): void {
    const query = this.memberSearch.value.trim();
    this.directCommunicationNotice.set('');
    if (query.length < 2) {
      this.memberSearchResults.set([]);
      return;
    }
    this.memberCommunication.searchMembers(query).subscribe({
      next: (members) => this.memberSearchResults.set(members),
      error: ({ error }) =>
        this.directCommunicationNotice.set(
          error?.message ?? 'Member search is unavailable.'
        )
    });
  }

  addDirectContact(member: CommunityMemberContact): void {
    this.memberCommunication.addContact(member.id).subscribe({
      next: (contact) => {
        this.directContacts.update((contacts) =>
          contacts.some(({ id }) => id === contact.id)
            ? contacts
            : [...contacts, contact].sort((a, b) =>
                a.fullName.localeCompare(b.fullName)
              )
        );
        this.openDirectConversation(contact);
        this.directCommunicationNotice.set(`${contact.fullName} was added.`);
      },
      error: ({ error }) =>
        this.directCommunicationNotice.set(
          error?.message ?? 'The member could not be added.'
        )
    });
  }

  openDirectConversation(member: CommunityMemberContact): void {
    this.selectedDirectMember.set(member);
    this.directCommunicationNotice.set('');
    this.memberCommunication.getConversation(member.id).subscribe({
      next: (messages) => this.directMessages.set(messages),
      error: ({ error }) =>
        this.directCommunicationNotice.set(
          error?.message ?? 'The conversation could not be loaded.'
        )
    });
  }

  sendDirectMessage(): void {
    const contact = this.selectedDirectMember();
    const text = this.directMessage.value.trim();
    if (!contact || !text) return;
    this.memberCommunication.sendMessage(contact.id, text).subscribe({
      next: (message) => {
        this.directMessages.update((messages) => [...messages, message]);
        this.directMessage.setValue('');
      },
      error: ({ error }) =>
        this.directCommunicationNotice.set(
          error?.message ?? 'The message could not be sent.'
        )
    });
  }

  directMessageIsMine(message: DirectMemberMessage): boolean {
    return message.senderUserId === String(this.user()?.id ?? '');
  }

  directMessageTime(message: DirectMemberMessage): string {
    return new Intl.DateTimeFormat('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(message.sentAt));
  }

  contactInitials(contact: CommunityMemberContact): string {
    return `${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`;
  }

  private loadDirectContacts(): void {
    this.memberCommunication.getContacts().subscribe({
      next: (contacts) => this.directContacts.set(contacts)
    });
  }

  backToDashboard(): void {
    void this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
