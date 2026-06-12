import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, ServiceSubscription, User } from './auth.service';
import { ProfileModalComponent } from './profile-modal.component';
import { RoleSwitcherComponent } from './shared/components/role-switcher/role-switcher.component';
import {
  Church,
  ChurchBranch,
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
  private readonly communities = inject(MemberCommunityService);
  private readonly scriptures = inject(DailyScriptureService);
  private readonly memberCommunication = inject(MemberCommunicationService);

  readonly user = signal<User | null>(null);
  readonly profileOpen = signal(false);
  readonly subscriptions = signal<ServiceSubscription[]>([]);
  readonly walletOpen = signal(false);
  readonly kznccChurches = signal<Church[]>([]);
  readonly churchBranches = signal<ChurchBranch[]>([]);
  readonly memberCommunity = signal<MemberCommunity | null>(null);
  readonly churchSelection = new FormControl('', { nonNullable: true });
  readonly branchSelection = new FormControl('', { nonNullable: true });
  readonly churchLinkedMessage = signal('');
  readonly dailyScripture = signal<DailyScripture>(this.scriptures.getToday());
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
    funeral: { name: 'Funeral Services', image: '/service-funeral-general.png', accent: '#2d963d' },
    community: { name: 'My Community', image: '/service-community.png', accent: '#58c91a' },
    referral: { name: 'Referral', image: '/service-referral.png', accent: '#16a34a' },
    'job-search': { name: 'Job Search', image: '/service-job-search.png', accent: '#1685ea' },
    'vas-services': { name: 'VAS Services', image: '/service-vas.png', accent: '#58c91a' },
    eduu: { name: 'EduU', image: '/service-education.png', accent: '#087ce8' },
    'vuma-fibre': { name: 'Vuma Fibre', image: '/service-vuma-fibre.png', accent: '#8c2be2' },
    'catch-a-ride': { name: 'Catch a Ride', image: '/service-catch-a-lift.png', accent: '#48b824' },
    kzncc: { name: 'KZNCC', image: '/service-kzncc.png', accent: '#087ce8' },
    'keycha-properties': { name: 'Keytcha Properties', image: '/service-keycha-properties.png', accent: '#48b824' },
    wallet: { name: 'My Wallet', image: '/service-my-wallet.png', accent: '#087ce8' }
  };
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
    this.auth.getProfile().subscribe({
      next: (user) => {
        this.user.set(user);
        this.loadDirectContacts();
        this.communities.getMemberCommunity(String(user.id)).subscribe((community) => {
          this.memberCommunity.set(community);
          this.churchSelection.setValue(community?.churchId ?? '');
          this.branchSelection.setValue(community?.branchId ?? '');
          this.loadBranches(false);
        });
      },
      error: () => this.logout()
    });
    this.auth.getSubscriptions().subscribe({
      next: (subscriptions) => this.subscriptions.set(subscriptions)
    });
    this.communities.getActiveChurches().subscribe((churches) =>
      this.kznccChurches.set(churches)
    );
  }

  selectedKznccChurch(): Church | undefined {
    return this.kznccChurches().find(
      ({ id }) => id === this.memberCommunity()?.churchId
    );
  }

  communityHeading(): string {
    return this.communities.getCommunityHeading(this.memberCommunity());
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
      .subscribe((community) => {
        this.memberCommunity.set(community);
        this.churchLinkedMessage.set(
          'This church and branch are now linked to My Community.'
        );
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

  activeServices() {
    return this.subscriptions()
      .filter((subscription) => subscription.status === 'active')
      .map((subscription) => ({
        ...subscription,
        ...(this.serviceDetails[subscription.serviceCode] ?? {
          name: subscription.planLabel,
          image: '/inkolo-connect-logo.png',
          accent: '#087ce8'
        }),
        name:
          subscription.serviceCode === 'community'
            ? this.communityHeading()
            : this.serviceDetails[subscription.serviceCode]?.name ??
              subscription.planLabel
      }));
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
