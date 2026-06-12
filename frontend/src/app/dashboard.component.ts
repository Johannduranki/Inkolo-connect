import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { switchMap } from 'rxjs';
import {
  AuthService,
  ServiceSubscription,
  User
} from './auth.service';
import { ProfileModalComponent } from './profile-modal.component';
import { RoleSwitcherComponent } from './shared/components/role-switcher/role-switcher.component';
import { Church, ChurchBranch, MemberCommunity } from './core/models/member-community.model';
import { MemberCommunityService } from './core/services/member-community.service';
import {
  BuySellChatConversation,
  BuySellChatMessage,
  BuySellCondition,
  BuySellListing,
  BuySellPaymentRequest
} from './features/buy-sell/models/buy-sell.model';
import { BuySellService } from './features/buy-sell/services/buy-sell.service';
import { BuySellChatService } from './features/buy-sell/services/buy-sell-chat.service';
import { BuySellPaymentService } from './features/buy-sell/services/buy-sell-payment.service';
import {
  EmploymentType,
  JobApplication,
  JobChatConversation,
  JobChatMessage,
  JobListing as JobSearchListing,
  JobPaymentRequest
} from './features/job-search/models/job-search.model';
import { JobListingService } from './features/job-search/services/job-listing.service';
import { JobApplicationService } from './features/job-search/services/job-application.service';
import { JobChatService } from './features/job-search/services/job-chat.service';
import { JobPaymentService } from './features/job-search/services/job-payment.service';
import { ProfileService } from './profile.service';
import {
  AirtimeDataPurchase,
  DataBundle,
  SavedBeneficiary
} from './features/vas/models/vas.model';
import { AirtimeDataService } from './features/vas/services/airtime-data.service';
import { ElectricityService } from './features/vas/services/electricity.service';
import { BeneficiaryService } from './features/vas/services/beneficiary.service';
import { WalletService } from './core/services/wallet.service';
import {
  MemberReferral,
  ReferralService
} from './core/services/referral.service';

interface Service {
  code: string;
  name: string;
  description: string;
  image: string;
  accent: string;
  tag: string;
  availability: 'available' | 'coming-soon';
  billingNote: string;
  plans: ServicePlan[];
  application?: boolean;
}

interface ServicePlan {
  code: string;
  name: string;
  price: string;
  description: string;
  provider?: string;
  image?: string;
}

interface Announcement {
  category: string;
  title: string;
  summary: string;
  date: string;
  featured?: boolean;
}

interface ChatMessage {
  author: string;
  initials: string;
  message: string;
  time: string;
  mine?: boolean;
}

interface AssistantMessage {
  role: 'assistant' | 'user';
  text: string;
}

interface WalletTransaction {
  description: string;
  date: string;
  amount: number;
}

interface UpcomingWalletSpending {
  serviceCode: string;
  serviceName: string;
  planName: string;
  amount: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    ProfileModalComponent,
    RoleSwitcherComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly communities = inject(MemberCommunityService);
  private readonly buySell = inject(BuySellService);
  private readonly buySellChats = inject(BuySellChatService);
  private readonly buySellPayments = inject(BuySellPaymentService);
  private readonly jobListingService = inject(JobListingService);
  private readonly jobApplications = inject(JobApplicationService);
  private readonly jobChats = inject(JobChatService);
  private readonly jobPayments = inject(JobPaymentService);
  private readonly profiles = inject(ProfileService);
  private readonly airtimeData = inject(AirtimeDataService);
  private readonly electricity = inject(ElectricityService);
  private readonly beneficiaries = inject(BeneficiaryService);
  private readonly walletService = inject(WalletService);
  private readonly referrals = inject(ReferralService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly user = signal<User | null>(null);
  readonly profileOpen = signal(false);
  readonly subscriptions = signal<ServiceSubscription[]>([]);
  readonly selectedService = signal<Service | null>(null);
  readonly selectedPlanCode = signal('');
  readonly funeralInkoloPlan = signal<'single' | 'family' | ''>('');
  readonly africanBankFuneralSelected = signal(false);
  readonly communityChurches = signal<Church[]>([]);
  readonly communityBranches = signal<ChurchBranch[]>([]);
  readonly memberCommunity = signal<MemberCommunity | null>(null);
  readonly communityChurchId = new FormControl('', { nonNullable: true });
  readonly communityBranchId = new FormControl('', { nonNullable: true });
  readonly subscriptionLoading = signal(false);
  readonly resetLoading = signal(false);
  readonly subscriptionError = signal('');
  readonly termsAccepted = signal(false);
  readonly vumaSharingConsent = signal(false);
  readonly referralFirstName = new FormControl('', { nonNullable: true });
  readonly referralLastName = new FormControl('', { nonNullable: true });
  readonly referralTelephone = new FormControl('', { nonNullable: true });
  readonly referralOutgoing = signal<MemberReferral[]>([]);
  readonly referralIncoming = signal<MemberReferral[]>([]);
  readonly referralNotice = signal('');
  readonly walletOpen = signal(false);
  readonly walletAction = signal<'topup' | 'cashout' | 'transfer' | null>(null);
  readonly walletActionLoading = signal(false);
  readonly walletActionNotice = signal('');
  readonly walletAmount = new FormControl('', { nonNullable: true });
  readonly africanBankAccountHolder = new FormControl('', { nonNullable: true });
  readonly africanBankAccountNumber = new FormControl('', { nonNullable: true });
  readonly africanBankAccountType = new FormControl<'SAVINGS' | 'CURRENT'>('SAVINGS', {
    nonNullable: true
  });
  readonly walletRecipientTelephone = new FormControl('', { nonNullable: true });
  readonly walletTransferReference = new FormControl('', { nonNullable: true });
  readonly vasPurchaseComplete = signal('');
  readonly vasAccount = new FormControl('', { nonNullable: true });
  readonly vasConfirmAccount = new FormControl('', { nonNullable: true });
  readonly vasAmount = new FormControl('', { nonNullable: true });
  readonly vasBuyingFor = new FormControl<'MYSELF' | 'SOMEONE_ELSE'>('MYSELF', {
    nonNullable: true
  });
  readonly vasRecipientName = new FormControl('', { nonNullable: true });
  readonly vasNetwork = new FormControl<AirtimeDataPurchase['network']>('VODACOM', {
    nonNullable: true
  });
  readonly vasPurchaseType = new FormControl<'AIRTIME' | 'DATA' | 'COMBO'>('AIRTIME', {
    nonNullable: true
  });
  readonly vasProvider = new FormControl('Eskom', { nonNullable: true });
  readonly vasBundleName = new FormControl('', { nonNullable: true });
  readonly vasSaveBeneficiary = new FormControl(false, { nonNullable: true });
  readonly vasSelectedBeneficiary = new FormControl('', { nonNullable: true });
  readonly vasNetworks = signal<string[]>([]);
  readonly vasProviders = signal<string[]>([]);
  readonly vasBundles = signal<DataBundle[]>([]);
  readonly savedVasBeneficiaries = signal<SavedBeneficiary[]>([]);
  readonly walletBalance = signal(850);
  readonly walletTransactions = signal<WalletTransaction[]>([
    { description: 'Wallet activated', date: 'Today', amount: 0 },
    { description: 'Community payment received', date: '7 June', amount: 250 },
    { description: 'Opening balance', date: '5 June', amount: 600 }
  ]);
  readonly marketplaceOpen = signal(false);
  readonly listingFormOpen = signal(false);
  readonly listingImage = signal('');
  readonly listingTitle = new FormControl('', { nonNullable: true });
  readonly listingDescription = new FormControl('', { nonNullable: true });
  readonly listingPrice = new FormControl('', { nonNullable: true });
  readonly listingCategory = new FormControl('Other', { nonNullable: true });
  readonly listingCondition = new FormControl<BuySellCondition>('SECOND_HAND', {
    nonNullable: true
  });
  readonly listingArea = new FormControl('', { nonNullable: true });
  readonly marketplaceListings = signal<BuySellListing[]>([]);
  readonly marketplaceSearch = new FormControl('', { nonNullable: true });
  readonly marketplaceArea = new FormControl('', { nonNullable: true });
  readonly marketplaceCategory = new FormControl('', { nonNullable: true });
  readonly marketplaceCondition = new FormControl('', { nonNullable: true });
  readonly marketplaceMinPrice = new FormControl('', { nonNullable: true });
  readonly marketplaceMaxPrice = new FormControl('', { nonNullable: true });
  readonly marketplaceCommunity = new FormControl('', { nonNullable: true });
  readonly marketplaceRating = new FormControl('', { nonNullable: true });
  readonly marketplaceStatus = new FormControl('AVAILABLE', { nonNullable: true });
  readonly selectedMarketplaceListing = signal<BuySellListing | null>(null);
  readonly marketplaceConversation = signal<BuySellChatConversation | null>(null);
  readonly marketplaceConversations = signal<BuySellChatConversation[]>([]);
  readonly marketplaceMessages = signal<BuySellChatMessage[]>([]);
  readonly marketplacePaymentRequests = signal<BuySellPaymentRequest[]>([]);
  readonly marketplaceChatText = new FormControl('', { nonNullable: true });
  readonly marketplaceRequestAmount = new FormControl('', { nonNullable: true });
  readonly marketplaceNotice = signal('');
  readonly buySellCategories = [
    'Electronics',
    'Phones',
    'Furniture',
    'Clothing',
    'Appliances',
    'Vehicles / parts',
    'Building materials',
    'Household goods',
    'Baby items',
    'Tools',
    'Books',
    'Food items',
    'Other'
  ];
  readonly jobsOpen = signal(false);
  readonly jobFormOpen = signal(false);
  readonly jobTitle = new FormControl('', { nonNullable: true });
  readonly jobCompany = new FormControl('', { nonNullable: true });
  readonly jobLocation = new FormControl('', { nonNullable: true });
  readonly jobType = new FormControl<EmploymentType>('FULL_TIME', { nonNullable: true });
  readonly jobSalary = new FormControl('', { nonNullable: true });
  readonly jobDescription = new FormControl('', { nonNullable: true });
  readonly jobCategory = new FormControl('Other', { nonNullable: true });
  readonly jobWorkMode = new FormControl<'REMOTE' | 'ON_SITE' | 'HYBRID'>('ON_SITE', { nonNullable: true });
  readonly jobPaymentFrequency = new FormControl<'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONCE_OFF'>('MONTHLY', { nonNullable: true });
  readonly jobListings = signal<JobSearchListing[]>([]);
  readonly jobSearch = new FormControl('', { nonNullable: true });
  readonly jobFilterArea = new FormControl('', { nonNullable: true });
  readonly jobFilterCategory = new FormControl('', { nonNullable: true });
  readonly jobFilterEmployment = new FormControl('', { nonNullable: true });
  readonly jobFilterWorkMode = new FormControl('', { nonNullable: true });
  readonly jobFilterMinPay = new FormControl('', { nonNullable: true });
  readonly jobFilterMaxPay = new FormControl('', { nonNullable: true });
  readonly jobFilterCommunity = new FormControl('', { nonNullable: true });
  readonly jobFilterStatus = new FormControl('OPEN', { nonNullable: true });
  readonly selectedJob = signal<JobSearchListing | null>(null);
  readonly jobConversation = signal<JobChatConversation | null>(null);
  readonly jobMessages = signal<JobChatMessage[]>([]);
  readonly jobPaymentRequests = signal<JobPaymentRequest[]>([]);
  readonly myJobApplications = signal<JobApplication[]>([]);
  readonly jobApplicationMessage = new FormControl('', { nonNullable: true });
  readonly jobChatText = new FormControl('', { nonNullable: true });
  readonly jobPaymentAmount = new FormControl('', { nonNullable: true });
  readonly jobNotice = signal('');
  readonly jobCategories = [
    'Cleaning', 'Gardening', 'Security', 'Plumbing', 'Electrical', 'Childcare',
    'Driving', 'Admin', 'Construction', 'General work', 'Skilled trade',
    'Professional service', 'Domestic work', 'Delivery', 'Maintenance', 'Sales',
    'Call centre', 'IT / computer work', 'Other'
  ];
  readonly bankConfirmationFile = signal<File | null>(null);
  readonly idDocumentFile = signal<File | null>(null);
  readonly stepUpApplicationStatus = signal<'submitted' | null>(null);
  readonly assistantOpen = signal(false);
  readonly assistantQuestion = new FormControl('', { nonNullable: true });
  readonly assistantMessages = signal<AssistantMessage[]>([
    {
      role: 'assistant',
      text: 'Hello! I am the Inkolo Connect assistant. Ask me about services, subscriptions or your account.'
    }
  ]);
  readonly announcements: Announcement[] = [
    {
      category: 'Community',
      title: 'New Born Church monthly gathering',
      summary: 'Join members for updates, questions and upcoming community opportunities.',
      date: '14 June',
      featured: true
    },
    {
      category: 'Services',
      title: 'New services now available',
      summary: 'Explore Wallet, My Community, Referral and more from your dashboard.',
      date: '8 June'
    },
    {
      category: 'Reminder',
      title: 'Keep your member profile current',
      summary: 'Accurate contact information helps us share important community notices.',
      date: '5 June'
    }
  ];
  readonly chatMessage = new FormControl('', { nonNullable: true });
  readonly chatMessages = signal<ChatMessage[]>([
    {
      author: 'Nandi M.',
      initials: 'NM',
      message: 'Morning everyone. Has anyone joined the new savings service yet?',
      time: '09:14'
    },
    {
      author: 'Thabo K.',
      initials: 'TK',
      message: 'Yes, I subscribed today. The process was quick.',
      time: '09:18'
    },
    {
      author: 'Lerato S.',
      initials: 'LS',
      message: 'Thanks for sharing. I am going to look at it now.',
      time: '09:21'
    }
  ]);
  readonly services: Service[] = [
    {
      code: 'build-up-balance',
      name: 'Buy and Sell',
      description: 'Buy, sell and exchange products with trusted community members.',
      image: '/service-buy-and-sell.png',
      accent: '#248fe5',
      tag: 'Marketplace',
      availability: 'available',
      billingNote: 'Join the community marketplace to buy and sell products.',
      plans: [
        {
          code: 'free',
          name: 'Buy and Sell access',
          price: 'Free',
          description: 'Activate access to buy and sell with community members.'
        }
      ]
    },
    {
      code: 'funeral',
      name: 'Funeral Services',
      description: 'Access community-based funeral services and protection for your family.',
      image: '/service-funeral-general.png',
      accent: '#2d963d',
      tag: 'Family protection',
      availability: 'available',
      billingNote: 'Choose the cover that fits your household.',
      plans: [
        {
          code: 'single',
          name: 'Single subscription',
          price: 'R50',
          description: 'Inkolo Funeral Cover for one member.',
          provider: 'Inkolo Funeral Cover',
          image: '/service-funeral-general.png'
        },
        {
          code: 'family',
          name: 'Family subscription',
          price: 'R75',
          description: 'Inkolo Funeral Cover for the family.',
          provider: 'Inkolo Funeral Cover',
          image: '/service-funeral-general.png'
        },
        {
          code: 'african-bank',
          name: 'African Bank Funeral Cover',
          price: 'R25',
          description: 'Affordable funeral cover offered through African Bank.',
          provider: 'African Bank',
          image: '/service-african-bank-funeral.png'
        }
      ]
    },
    {
      code: 'community',
      name: 'My Community',
      description: 'Connect with your community, share updates and participate locally.',
      image: '/service-community.png',
      accent: '#58c91a',
      tag: 'Community',
      availability: 'available',
      billingNote: 'Add community friends and stay connected.',
      plans: [
        {
          code: 'free',
          name: 'Community access',
          price: 'Free',
          description: 'Connect with and add friends from your community.'
        }
      ]
    },
    {
      code: 'referral',
      name: 'Referral',
      description: 'Invite new members, grow the network and earn referral rewards.',
      image: '/service-referral.png',
      accent: '#16a34a',
      tag: 'Invite & earn',
      availability: 'available',
      billingNote: 'Earn R0.50 per month for every active person you refer.',
      plans: [
        {
          code: 'free',
          name: 'Referral access',
          price: 'Free',
          description: 'Receive R0.50 monthly per active referred member.'
        }
      ]
    },
    {
      code: 'job-search',
      name: 'Job Search',
      description: 'Discover local job opportunities and connect with potential employers.',
      image: '/service-job-search.png',
      accent: '#1685ea',
      tag: 'Employment',
      availability: 'available',
      billingNote: 'Browse employment opportunities available to the community.',
      plans: [
        {
          code: 'free',
          name: 'Job Search access',
          price: 'Free',
          description: 'Browse job listings and employment opportunities.'
        }
      ]
    },
    {
      code: 'vas-services',
      name: 'VAS Services',
      description: 'Buy essential prepaid services quickly and securely.',
      image: '/service-vas.png',
      accent: '#58c91a',
      tag: 'Everyday services',
      availability: 'available',
      billingNote: 'Choose the prepaid service you need.',
      plans: [
        {
          code: 'free',
          name: 'VAS Services access',
          price: 'Free',
          description: 'Activate VAS Services to buy airtime, data and electricity.'
        },
        {
          code: 'airtime-data',
          name: 'Buy Airtime or Data',
          price: 'Pay as you go',
          description: 'Purchase airtime or mobile data.',
          image: '/service-airtime-data.png'
        },
        {
          code: 'electricity',
          name: 'Prepaid Electricity',
          price: 'Pay as you go',
          description: 'Purchase prepaid electricity securely.',
          image: '/service-prepaid-electricity.png'
        }
      ]
    },
    {
      code: 'eduu',
      name: 'EduU',
      description: 'Learn, grow and succeed through digital educational services.',
      image: '/service-education.png',
      accent: '#087ce8',
      tag: 'Education',
      availability: 'available',
      billingNote: 'Access learning resources and educational opportunities.',
      plans: [
        {
          code: 'free',
          name: 'EduU access',
          price: 'Free',
          description: 'Activate access to EduU learning services.'
        }
      ]
    },
    {
      code: 'vuma-fibre',
      name: 'Vuma Fibre',
      description: 'Explore fast and reliable fibre connectivity for your home.',
      image: '/service-vuma-fibre.png',
      accent: '#a62ee8',
      tag: 'Connectivity',
      availability: 'available',
      billingNote: 'Register your interest in Vuma Fibre connectivity.',
      plans: [
        {
          code: 'free',
          name: 'Vuma Fibre enquiry',
          price: 'Free enquiry',
          description: 'Explore availability and register your interest.'
        }
      ]
    },
    {
      code: 'catch-a-ride',
      name: 'Catch a Ride',
      description: 'Find and share trusted local rides with community members.',
      image: '/service-catch-a-lift.png',
      accent: '#58c91a',
      tag: 'Transport',
      availability: 'available',
      billingNote: 'Activate access to local community ride opportunities.',
      plans: [
        {
          code: 'free',
          name: 'Catch a Ride access',
          price: 'Free',
          description: 'Find or offer a ride in your community.'
        }
      ]
    },
    {
      code: 'kzncc',
      name: 'KZNCC Christian Council',
      description: 'Access KZNCC community services, support and member advantages.',
      image: '/service-kzncc.png',
      accent: '#087ce8',
      tag: 'Community membership',
      availability: 'available',
      billingNote: 'Join KZNCC for R7 per month.',
      plans: [
        {
          code: 'monthly',
          name: 'KZNCC monthly membership',
          price: 'R7 / month',
          description: 'Access all KZNCC community services and advantages.'
        }
      ]
    },
    {
      code: 'keycha-properties',
      name: 'Keytcha Properties',
      description: 'Explore property listings and connect with property owners and agents.',
      image: '/service-keycha-properties.png',
      accent: '#248fe5',
      tag: 'Property',
      availability: 'available',
      billingNote: 'Find, list and explore property opportunities.',
      plans: [
        {
          code: 'free',
          name: 'Property marketplace access',
          price: 'Free',
          description: 'Activate access to explore and list properties.'
        }
      ]
    },
    {
      code: 'wallet',
      name: 'Wallet',
      description: 'Manage your Inkolo Connect funds, balances and transactions in one place.',
      image: '/service-my-wallet.png',
      accent: '#56b837',
      tag: 'Money',
      availability: 'available',
      billingNote: 'Send and receive money with community members.',
      plans: [
        {
          code: 'free',
          name: 'Wallet access',
          price: 'Free',
          description: 'Activate your wallet for member-to-member payments.'
        }
      ]
    }
  ];

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (user) => {
        this.user.set(user);
        this.profiles.load().subscribe();
        this.refreshWallet();
        this.communities.getMemberCommunity(String(user.id)).subscribe((community) => {
          this.memberCommunity.set(community);
          if (community) {
            this.communityChurchId.setValue(community.churchId);
            this.communityBranchId.setValue(community.branchId ?? '');
          }
        });
      },
      error: () => this.logout()
    });
    this.auth.getSubscriptions().subscribe({
      next: (subscriptions) => this.subscriptions.set(subscriptions)
    });
    this.communities.getActiveChurches().subscribe((churches) =>
      this.communityChurches.set(churches)
    );
    this.loadMarketplaceListings();
    this.loadJobListings();
    this.airtimeData.getNetworks().subscribe((networks) => this.vasNetworks.set(networks));
    this.electricity.getElectricityProviders().subscribe((providers) =>
      this.vasProviders.set(providers)
    );
  }

  openService(service: Service): void {
    if (service.code === 'build-up-balance' && this.isServiceActive(service)) {
      this.marketplaceOpen.set(true);
      this.loadMarketplaceConversations();
      return;
    }

    if (service.code === 'community' && this.isServiceActive(service)) {
      void this.router.navigate(['/community']);
      return;
    }

    if (service.code === 'job-search' && this.isServiceActive(service)) {
      this.jobsOpen.set(true);
      return;
    }

    if (service.code === 'kzncc' && this.isServiceActive(service)) {
      void this.router.navigate(['/kzncc']);
      return;
    }

    if (service.code === 'wallet' && this.isServiceActive(service)) {
      this.refreshWallet();
    }

    if (service.availability === 'coming-soon') {
      window.alert(`${service.name} subscription details are coming soon.`);
      return;
    }

    this.selectedService.set(service);
    this.selectedPlanCode.set(
      service.code === 'funeral'
        ? ''
        : service.code === 'vas-services' && this.subscriptionFor(service.code)
        ? 'airtime-data'
        : service.plans[0]?.code ?? ''
    );
    this.funeralInkoloPlan.set('');
    this.africanBankFuneralSelected.set(false);
    if (service.code === 'community') {
      const community = this.memberCommunity();
      this.communityChurchId.setValue(community?.churchId ?? '');
      this.communityBranchId.setValue(community?.branchId ?? '');
      this.loadCommunityBranches();
    }
    this.subscriptionError.set('');
    this.termsAccepted.set(false);
    this.vumaSharingConsent.set(false);
    this.referralNotice.set('');
    this.vasPurchaseComplete.set('');
    this.vasAccount.setValue('');
    this.vasConfirmAccount.setValue('');
    this.vasAmount.setValue('');
    this.vasBuyingFor.setValue('MYSELF');
    this.vasRecipientName.setValue('');
    this.vasSaveBeneficiary.setValue(false);
    this.vasSelectedBeneficiary.setValue('');
    if (service.code === 'vas-services') {
      this.vasAccount.setValue(this.profiles.profile().telephoneNumber);
      this.vasConfirmAccount.setValue(this.profiles.profile().telephoneNumber);
      this.loadVasBeneficiaries();
      this.loadVasBundles();
    }
    if (service.code === 'referral' && this.subscriptionFor('referral')) {
      this.loadReferrals();
    }
    this.bankConfirmationFile.set(null);
    this.idDocumentFile.set(null);
  }

  closeSubscription(): void {
    if (this.subscriptionLoading()) {
      return;
    }

    this.selectedService.set(null);
    this.selectedPlanCode.set('');
    this.funeralInkoloPlan.set('');
    this.africanBankFuneralSelected.set(false);
    this.communityBranches.set([]);
    this.subscriptionError.set('');
    this.termsAccepted.set(false);
    this.vumaSharingConsent.set(false);
    this.referralNotice.set('');
    this.vasPurchaseComplete.set('');
    this.vasConfirmAccount.setValue('');
    this.bankConfirmationFile.set(null);
    this.idDocumentFile.set(null);
  }

  confirmSubscription(): void {
    const service = this.selectedService();
    const planCode =
      service?.code === 'funeral'
        ? this.getFuneralSubscriptionPlanCode()
        : this.selectedPlanCode();

    if (!service || this.subscriptionLoading()) {
      return;
    }

    if (service.code === 'funeral' && !planCode) {
      this.subscriptionError.set(
        'Please select at least one funeral cover option to activate Funeral Cover.'
      );
      return;
    }

    if (service.code === 'community') {
      const churchId = this.communityChurchId.value;
      const branchId = this.communityBranchId.value;

      if (!churchId) {
        this.subscriptionError.set('Please select a church to activate My Community.');
        return;
      }
      if (this.communityBranches().length > 0 && !branchId) {
        this.subscriptionError.set(
          'Please select a church branch to activate My Community.'
        );
        return;
      }
    }

    if (service.code === 'vuma-fibre' && !this.vumaSharingConsent()) {
      this.subscriptionError.set(
        'Please consent to sharing your personal details with Vuma before submitting the fibre enquiry.'
      );
      return;
    }

    if (!planCode || !this.termsAccepted()) {
      return;
    }

    this.subscriptionLoading.set(true);
    this.subscriptionError.set('');
    const subscriptionRequest =
      service.code === 'community'
        ? this.communities
            .subscribeMemberToCommunity(
              String(this.user()?.id ?? ''),
              this.communityChurchId.value,
              this.communityBranchId.value || undefined
            )
            .pipe(
              switchMap((community) => {
                this.memberCommunity.set(community);
                return this.auth.subscribeToService(
                  service.code,
                  planCode,
                  this.termsAccepted()
                );
              })
            )
        : this.auth.subscribeToService(
            service.code,
            planCode,
            this.termsAccepted()
          );

    subscriptionRequest.subscribe({
      next: (subscription) => {
        this.subscriptions.update((subscriptions) => [
          subscription,
          ...subscriptions.filter(
            (current) => current.serviceCode !== subscription.serviceCode
          )
        ]);
        this.subscriptionLoading.set(false);
        this.closeSubscription();
        if (subscription.serviceCode === 'community') {
          void this.router.navigate(['/community']);
        } else if (subscription.serviceCode === 'kzncc') {
          void this.router.navigate(['/kzncc']);
        }
      },
      error: (error) => {
        this.subscriptionLoading.set(false);
        this.subscriptionError.set(
          error.error?.message || 'We could not complete the subscription.'
        );
      }
    });
  }

  onCommunityChurchChange(): void {
    this.communityBranchId.setValue('');
    this.subscriptionError.set('');
    this.loadCommunityBranches();
  }

  communityHeading(): string {
    return this.communities.getCommunityHeading(this.memberCommunity());
  }

  serviceDisplayName(service: Service): string {
    return service.code === 'community' &&
      this.subscriptionFor('community') &&
      this.memberCommunity()
      ? this.communityHeading()
      : service.name;
  }

  isActiveFuneralView(service: Service): boolean {
    return service.code === 'funeral' && Boolean(this.subscriptionFor('funeral'));
  }

  activeFuneralPlans(): ServicePlan[] {
    const service = this.services.find(({ code }) => code === 'funeral');
    const planCode = this.subscriptionFor('funeral')?.planCode ?? '';
    if (!service || !planCode) return [];

    return service.plans.filter((plan) => {
      if (plan.code === 'african-bank') {
        return planCode.includes('african-bank');
      }
      return planCode === plan.code || planCode.startsWith(`${plan.code}-`);
    });
  }

  hasActiveAfricanBankFuneral(): boolean {
    return this.activeFuneralPlans().some(({ code }) => code === 'african-bank');
  }

  isActiveReferralView(service: Service): boolean {
    return service.code === 'referral' && Boolean(this.subscriptionFor('referral'));
  }

  isActiveWalletView(service: Service): boolean {
    return service.code === 'wallet' && Boolean(this.subscriptionFor('wallet'));
  }

  isActiveEduUView(service: Service): boolean {
    return service.code === 'eduu' && Boolean(this.subscriptionFor('eduu'));
  }

  hasServiceTerms(service: Service): boolean {
    return [
      'build-up-balance',
      'catch-a-ride',
      'funeral',
      'community',
      'vas-services',
      'keycha-properties',
      'referral',
      'job-search',
      'eduu',
      'wallet'
    ].includes(service.code);
  }

  serviceTermsTitle(service: Service): string {
    const titles: Record<string, string> = {
      'build-up-balance': 'Buy & Sell',
      'catch-a-ride': 'Catch a Ride',
      funeral: 'Funeral Services',
      community: 'My Community Church',
      'vas-services': 'VAS Services',
      'keycha-properties': 'Keytcha Properties',
      referral: 'Referral Service',
      'job-search': 'Job Search',
      eduu: 'EduU Service',
      wallet: 'Wallet'
    };
    return titles[service.code] ?? service.name;
  }

  serviceTermsSlug(service: Service): string {
    const slugs: Record<string, string> = {
      'build-up-balance': 'buy-sell-terms',
      'catch-a-ride': 'catch-a-ride-terms',
      funeral: 'funeral-services-terms',
      community: 'my-community-terms',
      'vas-services': 'vas-services-terms',
      'keycha-properties': 'keytcha-properties-terms',
      referral: 'referral-service-terms',
      'job-search': 'job-search-terms',
      eduu: 'eduu-service-terms',
      wallet: 'wallet-terms'
    };
    return slugs[service.code] ?? '';
  }

  serviceTermsUrl(service: Service): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `/${this.serviceTermsSlug(service)}.html`
    );
  }

  submitReferral(): void {
    const firstName = this.referralFirstName.value.trim();
    const lastName = this.referralLastName.value.trim();
    const telephone = this.normalizeTelephone(this.referralTelephone.value);
    if (!firstName || !lastName || !/^0\d{9}$/.test(telephone)) {
      this.referralNotice.set('Enter the person’s name, surname and valid cellphone number.');
      return;
    }
    if (telephone === this.currentTelephoneNumber()) {
      this.referralNotice.set('You cannot refer your own member profile.');
      return;
    }

    const currentName = `${this.user()?.firstName ?? ''} ${this.user()?.lastName ?? ''}`.trim();
    this.referrals.createReferral({
      referrerName: currentName,
      referrerPhone: this.currentTelephoneNumber(),
      referredName: `${firstName} ${lastName}`,
      referredPhone: telephone
    }).subscribe(() => {
      this.referralFirstName.setValue('');
      this.referralLastName.setValue('');
      this.referralTelephone.setValue('');
      this.referralNotice.set(
        `${firstName} ${lastName} must acknowledge the referral from their own Referral window.`
      );
      this.loadReferrals();
    });
  }

  acknowledgeReferral(referral: MemberReferral, accepted: boolean): void {
    this.referrals.acknowledgeReferral(referral.id, accepted).subscribe(() => {
      this.referralNotice.set(
        accepted
          ? `You acknowledged that ${referral.referrerName} referred you.`
          : 'The referral was declined.'
      );
      this.loadReferrals();
    });
  }

  private loadReferrals(): void {
    const telephone = this.currentTelephoneNumber();
    this.referrals.getOutgoing(telephone).subscribe((items) =>
      this.referralOutgoing.set(items)
    );
    this.referrals.getIncoming(telephone).subscribe((items) =>
      this.referralIncoming.set(items)
    );
  }

  private currentTelephoneNumber(): string {
    const profilePhone = this.normalizeTelephone(this.profiles.profile().telephoneNumber);
    if (profilePhone) return profilePhone;
    const demoPhones: Record<number, string> = {
      1: '0712345678',
      2: '0725550184',
      3: '0736614209',
      4: '0789441132',
      5: '0741002003',
      6: '0763004005',
      7: '0795006007',
      8: '0817008009'
    };
    return demoPhones[this.user()?.id ?? 0] ?? '';
  }

  private normalizeTelephone(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.startsWith('27') && digits.length === 11
      ? `0${digits.slice(2)}`
      : digits;
  }

  private loadCommunityBranches(): void {
    const churchId = this.communityChurchId.value;
    if (!churchId) {
      this.communityBranches.set([]);
      return;
    }
    this.communities.getBranchesByChurch(churchId).subscribe((branches) =>
      this.communityBranches.set(branches)
    );
  }

  selectFuneralPlan(planCode: string): void {
    this.subscriptionError.set('');

    if (planCode === 'african-bank') {
      this.africanBankFuneralSelected.update((selected) => !selected);
      return;
    }

    if (planCode === 'single' || planCode === 'family') {
      this.funeralInkoloPlan.set(planCode);
    }
  }

  isFuneralPlanSelected(planCode: string): boolean {
    return planCode === 'african-bank'
      ? this.africanBankFuneralSelected()
      : this.funeralInkoloPlan() === planCode;
  }

  private getFuneralSubscriptionPlanCode(): string {
    const inkoloPlan = this.funeralInkoloPlan();
    const hasAfricanBank = this.africanBankFuneralSelected();

    if (inkoloPlan && hasAfricanBank) {
      return `${inkoloPlan}-african-bank`;
    }

    return inkoloPlan || (hasAfricanBank ? 'african-bank' : '');
  }

  selectApplicationFile(
    type: 'bank' | 'id',
    event: Event
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (type === 'bank') {
      this.bankConfirmationFile.set(file);
    } else {
      this.idDocumentFile.set(file);
    }
  }

  submitStepUpApplication(): void {
    const bankConfirmation = this.bankConfirmationFile();
    const idDocument = this.idDocumentFile();

    if (!bankConfirmation || !idDocument || this.subscriptionLoading()) {
      return;
    }

    this.subscriptionLoading.set(true);
    this.subscriptionError.set('');
    this.auth.applyForStepUpBoost(bankConfirmation, idDocument).subscribe({
      next: () => {
        this.stepUpApplicationStatus.set('submitted');
        this.subscriptionLoading.set(false);
        this.closeSubscription();
      },
      error: (error) => {
        this.subscriptionLoading.set(false);
        this.subscriptionError.set(
          error.error?.message || 'We could not submit your application.'
        );
      }
    });
  }

  subscriptionFor(serviceCode: string): ServiceSubscription | undefined {
    return this.subscriptions().find(
      (subscription) => subscription.serviceCode === serviceCode
    );
  }

  subscriptionPrice(service: Service): string {
    const subscription = this.subscriptionFor(service.code);

    if (!subscription) {
      return '';
    }

    const plan = service.plans.find(
      (candidate) => candidate.code === subscription.planCode
    );

    return plan?.price ?? (
      subscription.amountCents === 0
        ? 'Free'
        : `R${(subscription.amountCents / 100).toFixed(2)}`
      );
  }

  monthlySubscriptionTotal(): string {
    const totalCents = this.subscriptions()
      .filter((subscription) => subscription.status === 'active')
      .reduce((total, subscription) => total + subscription.amountCents, 0);

    return `R${(totalCents / 100).toFixed(2)} p/m`;
  }

  walletMoneyReceived(): number {
    return this.walletTransactions()
      .filter(({ amount }) => amount > 0)
      .reduce((total, { amount }) => total + amount, 0);
  }

  walletMoneySpent(): number {
    return Math.abs(
      this.walletTransactions()
        .filter(({ amount }) => amount < 0)
        .reduce((total, { amount }) => total + amount, 0)
    );
  }

  upcomingWalletSpending(): UpcomingWalletSpending[] {
    return this.subscriptions()
      .filter(
        (subscription) =>
          subscription.status === 'active' && subscription.amountCents > 0
      )
      .map((subscription) => {
        const service = this.services.find(
          ({ code }) => code === subscription.serviceCode
        );
        const plan = service?.plans.find(
          ({ code }) => code === subscription.planCode
        );

        return {
          serviceCode: subscription.serviceCode,
          serviceName: service?.name ?? subscription.serviceCode,
          planName: plan?.name ?? subscription.planCode,
          amount: subscription.amountCents / 100
        };
      });
  }

  upcomingWalletSpendingTotal(): number {
    return this.upcomingWalletSpending().reduce(
      (total, spending) => total + spending.amount,
      0
    );
  }

  nextSubscriptionCollectionDate(): string {
    const nextCollection = new Date();
    nextCollection.setMonth(nextCollection.getMonth() + 1, 1);

    return new Intl.DateTimeFormat('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(nextCollection);
  }

  isServiceActive(service: Service): boolean {
    if (service.application) {
      return this.stepUpApplicationStatus() === 'submitted';
    }

    return Boolean(this.subscriptionFor(service.code));
  }

  subscribedServices(): Service[] {
    return this.services.filter((service) => this.isServiceActive(service));
  }

  availableServices(): Service[] {
    return this.services.filter((service) => !this.isServiceActive(service));
  }

  toggleWalletCard(): void {
    this.walletOpen.update((open) => !open);
  }

  private refreshWallet(): void {
    const userId = this.user()?.id;
    if (!userId) return;

    this.walletService.getMemberWallet(String(userId)).subscribe((wallet) => {
      if (wallet) this.walletBalance.set(wallet.balance);
    });
    this.walletService
      .getWalletTransactions(`member-${userId}`)
      .subscribe((transactions) =>
        this.walletTransactions.set(
          transactions.map((transaction) => ({
            description: transaction.description,
            date: new Intl.DateTimeFormat('en-ZA', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            }).format(new Date(transaction.createdAt)),
            amount:
              transaction.direction === 'OUT'
                ? -transaction.amount
                : transaction.amount
          }))
        )
      );
  }

  openWalletAction(action: 'topup' | 'cashout' | 'transfer'): void {
    this.walletAction.set(action);
    this.walletAmount.setValue('');
    this.walletActionNotice.set('');
    this.walletRecipientTelephone.setValue('');
    this.walletTransferReference.setValue('');
    if (action === 'cashout') {
      this.africanBankAccountHolder.setValue(
        `${this.user()?.firstName ?? ''} ${this.user()?.lastName ?? ''}`.trim()
      );
    }
  }

  closeWalletAction(): void {
    if (this.walletActionLoading()) return;
    this.walletAction.set(null);
    this.walletActionNotice.set('');
  }

  submitWalletAction(): void {
    const action = this.walletAction();
    const amount = Number(this.walletAmount.value);
    if (!action || !Number.isFinite(amount) || amount < 10) {
      this.walletActionNotice.set('Enter an amount of at least 10 Izaka.');
      return;
    }

    if (action === 'cashout') {
      const accountHolder = this.africanBankAccountHolder.value.trim();
      const accountNumber = this.africanBankAccountNumber.value.replace(/\s/g, '');
      if (!accountHolder || !/^\d{9,11}$/.test(accountNumber)) {
        this.walletActionNotice.set(
          'Enter the account holder and a valid 9 to 11 digit African Bank account number.'
        );
        return;
      }
      if (amount > this.walletBalance()) {
        this.walletActionNotice.set('Your wallet does not have enough Izaka for this cash out.');
        return;
      }

      this.walletActionLoading.set(true);
      this.walletService.cashOutToAfricanBank({
        memberId: this.currentUserId(),
        amount,
        accountHolder,
        accountNumber,
        accountType: this.africanBankAccountType.value,
        branchCode: '430000'
      }).subscribe((result) => {
        this.walletActionLoading.set(false);
        if (!result.successful) {
          this.walletActionNotice.set(result.message);
          return;
        }
        this.walletBalance.update((balance) => balance - amount);
        this.walletTransactions.update((transactions) => [
          {
            description: `Cash out to African Bank •${accountNumber.slice(-4)}`,
            date: 'Today',
            amount: -amount
          },
          ...transactions
        ]);
        this.walletActionNotice.set(
          `Cash out submitted. Reference ${result.reference}.`
        );
      });
      return;
    }

    if (action === 'transfer') {
      const recipientTelephoneNumber = this.walletRecipientTelephone.value.trim();
      const senderTelephoneNumber = this.profiles.profile().telephoneNumber.trim();
      if (!/^(?:0|\+?27)\d{9}$/.test(recipientTelephoneNumber.replace(/\s/g, ''))) {
        this.walletActionNotice.set('Enter a valid registered member cellphone number.');
        return;
      }
      if (amount > this.walletBalance()) {
        this.walletActionNotice.set('Your wallet does not have enough Izaka for this transfer.');
        return;
      }

      this.walletActionLoading.set(true);
      this.walletService.transferMemberToMember({
        senderMemberId: this.currentUserId(),
        senderTelephoneNumber,
        recipientTelephoneNumber,
        amount,
        paymentReference: this.walletTransferReference.value.trim()
      }).subscribe((result) => {
        this.walletActionLoading.set(false);
        if (!result.successful) {
          this.walletActionNotice.set(result.message);
          return;
        }
        this.walletBalance.update((balance) => balance - amount);
        this.walletTransactions.update((transactions) => [
          {
            description: `Transfer to ${result.recipientName ?? 'member'}`,
            date: 'Today',
            amount: -amount
          },
          ...transactions
        ]);
        this.walletActionNotice.set(
          `Transfer to ${result.recipientName} completed. Reference ${result.reference}.`
        );
      });
      return;
    }

    this.walletActionLoading.set(true);
    this.walletService.topUpWithCycle({
      memberId: this.currentUserId(),
      amount,
      returnUrl: `${window.location.origin}/dashboard/member`
    }).subscribe((result) => {
      this.walletActionLoading.set(false);
      if (!result.successful) {
        this.walletActionNotice.set('Cycle could not process this top up.');
        return;
      }
      this.walletBalance.update((balance) => balance + amount);
      this.walletTransactions.update((transactions) => [
        { description: 'Cycle bank card top up', date: 'Today', amount },
        ...transactions
      ]);
      this.walletActionNotice.set(
        `Top up successful. Reference ${result.reference}.`
      );
    });
  }

  closeMarketplace(): void {
    this.marketplaceOpen.set(false);
    this.listingFormOpen.set(false);
    this.selectedMarketplaceListing.set(null);
    this.marketplaceConversation.set(null);
    this.marketplaceMessages.set([]);
    this.marketplacePaymentRequests.set([]);
    this.marketplaceNotice.set('');
  }

  selectListingImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      this.listingImage.set(String(reader.result ?? ''));
    });
    reader.readAsDataURL(file);
  }

  addMarketplaceListing(): void {
    const user = this.user();
    const title = this.listingTitle.value.trim();
    const description = this.listingDescription.value.trim();
    const price = Number(this.listingPrice.value);
    const image = this.listingImage();

    if (!user || !title || !description || !image || !Number.isFinite(price) || price <= 0) {
      window.alert('Add a picture, title, description and valid price.');
      return;
    }

    this.buySell.createBuySellListing({
      title,
      description,
      category: this.listingCategory.value,
      condition: this.listingCondition.value,
      price,
      area: this.listingArea.value.trim() || 'Community area',
      images: [image],
      sellerUserId: String(user.id),
      sellerName: `${user.firstName} ${user.lastName}`,
      sellerCommunityName:
        this.communityHeading() === 'My Community' ? undefined : this.communityHeading(),
      sellerRating: 5,
      status: 'AVAILABLE'
    }).subscribe(() => this.applyMarketplaceFilters());
    this.listingTitle.setValue('');
    this.listingDescription.setValue('');
    this.listingPrice.setValue('');
    this.listingImage.set('');
    this.listingArea.setValue('');
    this.listingCategory.setValue('Other');
    this.listingCondition.setValue('SECOND_HAND');
    this.listingFormOpen.set(false);
  }

  applyMarketplaceFilters(): void {
    this.buySell.searchBuySellListings({
      query: this.marketplaceSearch.value,
      area: this.marketplaceArea.value,
      category: this.marketplaceCategory.value,
      condition: this.marketplaceCondition.value as BuySellCondition | '',
      minPrice: Number(this.marketplaceMinPrice.value) || undefined,
      maxPrice: Number(this.marketplaceMaxPrice.value) || undefined,
      community: this.marketplaceCommunity.value,
      minimumRating: Number(this.marketplaceRating.value) || undefined,
      status: this.marketplaceStatus.value as
        | 'AVAILABLE'
        | 'RESERVED'
        | 'SOLD'
        | ''
    }).subscribe((listings) => this.marketplaceListings.set(listings));
  }

  clearMarketplaceFilters(): void {
    [
      this.marketplaceSearch,
      this.marketplaceArea,
      this.marketplaceCategory,
      this.marketplaceCondition,
      this.marketplaceMinPrice,
      this.marketplaceMaxPrice,
      this.marketplaceCommunity,
      this.marketplaceRating
    ].forEach((control) => control.setValue(''));
    this.marketplaceStatus.setValue('AVAILABLE');
    this.applyMarketplaceFilters();
  }

  viewMarketplaceListing(listing: BuySellListing): void {
    this.selectedMarketplaceListing.set(listing);
    this.marketplaceConversation.set(null);
    this.marketplaceNotice.set('');
  }

  startMarketplaceChat(listing: BuySellListing): void {
    const currentUserId = String(this.user()?.id ?? '');
    if (!currentUserId) {
      return;
    }
    const buyerUserId =
      currentUserId === listing.sellerUserId ? 'demo-buyer' : currentUserId;
    this.buySellChats
      .startChatForListing(listing.id, buyerUserId, listing.sellerUserId)
      .subscribe({
        next: (conversation) => {
          this.selectedMarketplaceListing.set(listing);
          this.marketplaceConversation.set(conversation);
          this.marketplaceNotice.set(`Chat with ${listing.sellerName} is ready.`);
          this.loadMarketplaceConversations();
          this.refreshMarketplaceChat();
        },
        error: (error) => {
          this.marketplaceNotice.set(
            error.error?.message ?? 'The seller chat could not be opened.'
          );
        }
      });
  }

  sendMarketplaceMessage(): void {
    const conversation = this.marketplaceConversation();
    const text = this.marketplaceChatText.value.trim();
    const userId = String(this.user()?.id ?? '');
    if (!conversation || !text || !userId) {
      return;
    }
    this.buySellChats.sendBuySellChatMessage(conversation.id, {
      senderUserId: userId,
      messageType: 'TEXT',
      messageText: text
    }).subscribe({
      next: () => {
        this.marketplaceChatText.setValue('');
        this.marketplaceNotice.set('Message sent.');
        this.refreshMarketplaceChat();
      },
      error: (error) => {
        this.marketplaceNotice.set(
          error.error?.message ?? 'Your message could not be sent.'
        );
      }
    });
  }

  sendMarketplacePaymentRequest(): void {
    const conversation = this.marketplaceConversation();
    const listing = this.selectedMarketplaceListing();
    const userId = String(this.user()?.id ?? '');
    const amount = Number(this.marketplaceRequestAmount.value);
    if (
      !conversation ||
      !listing ||
      userId !== listing.sellerUserId ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      this.marketplaceNotice.set('Enter a valid payment request amount.');
      return;
    }
    this.buySellPayments.sendPaymentRequest(conversation.id, {
      listingId: listing.id,
      requestedByUserId: listing.sellerUserId,
      requestedFromUserId: conversation.buyerUserId,
      requestedAmount: amount,
      description: `Payment request for ${listing.title}`
    }).subscribe(() => {
      this.marketplaceRequestAmount.setValue('');
      this.marketplaceNotice.set('Payment request sent in this chat.');
      this.refreshMarketplaceChat();
    });
  }

  payMarketplaceRequest(request: BuySellPaymentRequest): void {
    const userId = String(this.user()?.id ?? '');
    if (!this.subscriptionFor('wallet')) {
      this.marketplaceNotice.set('Activate My Wallet before paying a seller.');
      return;
    }
    this.buySellPayments.payBuySellPaymentRequest(request.id, userId).subscribe({
      next: (transaction) => {
        this.walletBalance.update((balance) => balance - transaction.amount);
        this.walletTransactions.update((transactions) => [
          {
            description: transaction.reference,
            date: 'Today',
            amount: -transaction.amount
          },
          ...transactions
        ]);
        this.buySell.updateListingStatus(request.listingId, 'SOLD').subscribe();
        this.marketplaceNotice.set(
          `Payment of R${transaction.amount.toFixed(2)} completed from your wallet.`
        );
        this.refreshMarketplaceChat();
        this.applyMarketplaceFilters();
      },
      error: (error) => this.marketplaceNotice.set(error.message)
    });
  }

  declineMarketplaceRequest(request: BuySellPaymentRequest): void {
    this.buySellPayments
      .declinePaymentRequest(request.id, String(this.user()?.id ?? ''))
      .subscribe((declined) => {
        this.marketplaceNotice.set(
          declined ? 'Payment request declined.' : 'This request cannot be declined.'
        );
        this.refreshMarketplaceChat();
      });
  }

  isMarketplaceSeller(): boolean {
    return (
      this.selectedMarketplaceListing()?.sellerUserId ===
      String(this.user()?.id ?? '')
    );
  }

  currentUserId(): string {
    return String(this.user()?.id ?? '');
  }

  openMarketplaceConversation(conversation: BuySellChatConversation): void {
    const listing = this.marketplaceListings().find(
      ({ id }) => id === conversation.listingId
    );
    if (listing) this.selectedMarketplaceListing.set(listing);
    this.marketplaceConversation.set(conversation);
    this.marketplaceNotice.set('');
    this.refreshMarketplaceChat();
  }

  private loadMarketplaceListings(): void {
    this.buySell.getBuySellListings().subscribe((listings) =>
      this.marketplaceListings.set(listings)
    );
  }

  private loadMarketplaceConversations(): void {
    this.buySellChats.getMyConversations().subscribe({
      next: (conversations) => this.marketplaceConversations.set(conversations),
      error: () => this.marketplaceConversations.set([])
    });
  }

  private refreshMarketplaceChat(): void {
    const conversation = this.marketplaceConversation();
    const userId = String(this.user()?.id ?? '');
    if (!conversation || !userId) {
      return;
    }
    this.buySellChats
      .getMessagesForConversation(conversation.id, userId)
      .subscribe((messages) => this.marketplaceMessages.set(messages));
    this.buySellPayments
      .getPaymentRequests(conversation.id)
      .subscribe((requests) => this.marketplacePaymentRequests.set(requests));
  }

  closeJobs(): void {
    this.jobsOpen.set(false);
    this.jobFormOpen.set(false);
    this.selectedJob.set(null);
    this.jobConversation.set(null);
    this.jobMessages.set([]);
    this.jobPaymentRequests.set([]);
    this.jobNotice.set('');
  }

  addJobListing(): void {
    const user = this.user();
    const title = this.jobTitle.value.trim();
    const company = this.jobCompany.value.trim();
    const location = this.jobLocation.value.trim();
    const salary = Number(this.jobSalary.value);
    const description = this.jobDescription.value.trim();

    if (!user || !title || !company || !location || !description) {
      window.alert('Complete all job details before publishing.');
      return;
    }

    this.jobListingService.createJobListing({
      title,
      description,
      category: this.jobCategory.value,
      jobType: company,
      employmentType: this.jobType.value,
      workMode: this.jobWorkMode.value,
      area: location,
      paymentAmount: Number.isFinite(salary) && salary > 0 ? salary : undefined,
      paymentFrequency: this.jobPaymentFrequency.value,
      listedByUserId: String(user.id),
      listedByUserName: `${user.firstName} ${user.lastName}`,
      listedByCommunityName:
        this.communityHeading() === 'My Community' ? undefined : this.communityHeading(),
      listerRating: 5,
      status: 'OPEN'
    }).subscribe(() => this.applyJobFilters());
    this.jobTitle.setValue('');
    this.jobCompany.setValue('');
    this.jobLocation.setValue('');
    this.jobType.setValue('FULL_TIME');
    this.jobSalary.setValue('');
    this.jobDescription.setValue('');
    this.jobCategory.setValue('Other');
    this.jobType.setValue('FULL_TIME');
    this.jobWorkMode.setValue('ON_SITE');
    this.jobFormOpen.set(false);
  }

  applyJobFilters(): void {
    this.jobListingService.searchJobs({
      query: this.jobSearch.value,
      area: this.jobFilterArea.value,
      category: this.jobFilterCategory.value,
      employmentType: this.jobFilterEmployment.value as EmploymentType | '',
      workMode: this.jobFilterWorkMode.value as 'REMOTE' | 'ON_SITE' | 'HYBRID' | '',
      minPayment: Number(this.jobFilterMinPay.value) || undefined,
      maxPayment: Number(this.jobFilterMaxPay.value) || undefined,
      community: this.jobFilterCommunity.value,
      status: this.jobFilterStatus.value as JobSearchListing['status'] | ''
    }).subscribe((jobs) => this.jobListings.set(jobs));
  }

  clearJobFilters(): void {
    [
      this.jobSearch,
      this.jobFilterArea,
      this.jobFilterCategory,
      this.jobFilterEmployment,
      this.jobFilterWorkMode,
      this.jobFilterMinPay,
      this.jobFilterMaxPay,
      this.jobFilterCommunity
    ].forEach((control) => control.setValue(''));
    this.jobFilterStatus.setValue('OPEN');
    this.applyJobFilters();
  }

  viewJob(job: JobSearchListing): void {
    this.selectedJob.set(job);
    this.jobNotice.set('');
  }

  applyForSelectedJob(job: JobSearchListing): void {
    const user = this.user();
    if (!user || String(user.id) === job.listedByUserId) {
      this.jobNotice.set('You cannot apply for your own job listing.');
      return;
    }
    this.jobApplications.applyForJob(job.id, String(user.id), {
      applicantName: `${user.firstName} ${user.lastName}`,
      shortMessage: this.jobApplicationMessage.value.trim() || 'I am interested in this opportunity.'
    }).subscribe((application) => {
      this.jobApplicationMessage.setValue('');
      this.jobNotice.set(`Application ${application.status.toLowerCase()} successfully.`);
      this.loadMyJobApplications();
      this.startJobChat(job, application);
    });
  }

  startJobChat(job: JobSearchListing, application?: JobApplication): void {
    const currentUserId = String(this.user()?.id ?? '');
    if (!currentUserId) return;
    const applicantUserId = currentUserId === job.listedByUserId ? 'demo-applicant' : currentUserId;
    this.jobChats.startChatForJob(job.id, applicantUserId, job.listedByUserId)
      .subscribe((conversation) => {
        this.selectedJob.set(job);
        this.jobConversation.set(conversation);
        if (application) {
          this.jobChats.sendJobChatMessage(conversation.id, {
            senderUserId: applicantUserId,
            messageType: 'APPLICATION',
            messageText: application.shortMessage,
            applicationId: application.id
          }).subscribe();
        }
        this.refreshJobChat();
      });
  }

  sendJobMessage(): void {
    const conversation = this.jobConversation();
    const text = this.jobChatText.value.trim();
    if (!conversation || !text) return;
    this.jobChats.sendJobChatMessage(conversation.id, {
      senderUserId: this.currentUserId(),
      messageType: 'TEXT',
      messageText: text
    }).subscribe(() => {
      this.jobChatText.setValue('');
      this.refreshJobChat();
    });
  }

  sendInterviewRequest(): void {
    const conversation = this.jobConversation();
    const application = this.myJobApplications().find(({ jobId }) => jobId === conversation?.jobId);
    if (!conversation || !application || !this.isSelectedJobLister()) {
      this.jobNotice.set('An application is required before sending an interview request.');
      return;
    }
    this.jobChats.sendInterviewRequest(
      conversation.id,
      application.id,
      'You are invited to an interview. Please reply with your availability.',
      this.currentUserId()
    ).subscribe(() => this.refreshJobChat());
  }

  sendJobPaymentRequest(): void {
    const conversation = this.jobConversation();
    const job = this.selectedJob();
    const amount = Number(this.jobPaymentAmount.value);
    if (!conversation || !job || !Number.isFinite(amount) || amount <= 0) {
      this.jobNotice.set('Enter a valid job payment amount.');
      return;
    }
    const otherUserId =
      this.currentUserId() === conversation.applicantUserId
        ? conversation.listerUserId
        : conversation.applicantUserId;
    this.jobPayments.sendPaymentRequest(conversation.id, {
      jobId: job.id,
      requestedByUserId: this.currentUserId(),
      requestedFromUserId: otherUserId,
      requestedAmount: amount,
      description: `Payment request for ${job.title}`
    }).subscribe(() => {
      this.jobPaymentAmount.setValue('');
      this.jobNotice.set('Job payment request sent.');
      this.refreshJobChat();
    });
  }

  payJobRequest(request: JobPaymentRequest): void {
    if (!this.subscriptionFor('wallet')) {
      this.jobNotice.set('Activate My Wallet before paying this request.');
      return;
    }
    this.jobPayments.payJobPaymentRequest(request.id, this.currentUserId()).subscribe({
      next: (paid) => {
        this.walletBalance.update((balance) => balance - paid.requestedAmount);
        this.walletTransactions.update((transactions) => [{
          description: paid.description,
          date: 'Today',
          amount: -paid.requestedAmount
        }, ...transactions]);
        this.jobNotice.set(`Job payment of R${paid.requestedAmount.toFixed(2)} completed.`);
        this.refreshJobChat();
      },
      error: (error) => this.jobNotice.set(error.message)
    });
  }

  declineJobRequest(request: JobPaymentRequest): void {
    this.jobPayments.declinePaymentRequest(request.id, this.currentUserId()).subscribe((declined) => {
      this.jobNotice.set(declined ? 'Job payment request declined.' : 'This request cannot be declined.');
      this.refreshJobChat();
    });
  }

  isSelectedJobLister(): boolean {
    return this.selectedJob()?.listedByUserId === this.currentUserId();
  }

  private loadJobListings(): void {
    this.jobListingService.getJobListings().subscribe((jobs) => this.jobListings.set(jobs));
  }

  private loadMyJobApplications(): void {
    this.jobApplications.getApplicationsByApplicant(this.currentUserId()).subscribe((applications) =>
      this.myJobApplications.set(applications)
    );
  }

  private refreshJobChat(): void {
    const conversation = this.jobConversation();
    if (!conversation) return;
    this.jobChats.getMessagesForConversation(conversation.id, this.currentUserId())
      .subscribe((messages) => this.jobMessages.set(messages));
    this.jobPayments.getPaymentRequests(conversation.id)
      .subscribe((requests) => this.jobPaymentRequests.set(requests));
  }

  completeVasPurchase(): void {
    const planCode = this.selectedPlanCode();
    const account = this.vasAccount.value.trim();
    const confirmedAccount = this.vasConfirmAccount.value.trim();
    const amount = Number(this.vasAmount.value);

    if (!this.subscriptionFor('wallet')) {
      this.subscriptionError.set('Activate My Wallet before completing this purchase.');
      return;
    }
    if (!account || account !== confirmedAccount) {
      this.subscriptionError.set(
        planCode === 'electricity'
          ? 'Meter number and confirmation must match.'
          : 'Cellphone number and confirmation must match.'
      );
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      this.subscriptionError.set('Enter a valid purchase amount or select a data bundle.');
      return;
    }
    if (amount > this.walletBalance()) {
      this.subscriptionError.set(
        'Insufficient wallet balance. Please top up your wallet to complete this purchase.'
      );
      return;
    }

    if (planCode === 'electricity') {
      if (!this.vasProvider.value) {
        this.subscriptionError.set('Select an electricity provider.');
        return;
      }
      this.electricity
        .validateMeterNumber(account, this.vasProvider.value)
        .subscribe((valid) => {
          if (!valid) {
            this.subscriptionError.set('Enter a valid meter number.');
            return;
          }
          this.electricity.purchaseElectricity({
            userId: this.currentUserId(),
            buyingFor: this.vasBuyingFor.value,
            recipientName: this.vasRecipientName.value.trim() || undefined,
            meterNumber: account,
            provider: this.vasProvider.value,
            amount
          }).subscribe((purchase) => {
            this.finishVasPurchase(
              amount,
              `Electricity purchase: ${purchase.provider}`,
              `${purchase.reference} · Token ${purchase.token}`
            );
            this.saveCurrentVasBeneficiary('ELECTRICITY');
          });
        });
      return;
    }

    if (!/^0\d{9}$/.test(account)) {
      this.subscriptionError.set('Enter a valid 10-digit cellphone number.');
      return;
    }
    if (!this.vasNetwork.value) {
      this.subscriptionError.set('Select a mobile network.');
      return;
    }

    const purchase = {
      userId: this.currentUserId(),
      purchaseType: this.vasPurchaseType.value,
      buyingFor: this.vasBuyingFor.value,
      recipientName: this.vasRecipientName.value.trim() || undefined,
      cellphoneNumber: account,
      network: this.vasNetwork.value,
      amount,
      bundleName: this.vasBundleName.value || undefined,
      dataSize: this.vasBundles().find(
        ({ bundleName }) => bundleName === this.vasBundleName.value
      )?.dataSize,
      validityPeriod: this.vasBundles().find(
        ({ bundleName }) => bundleName === this.vasBundleName.value
      )?.validityPeriod
    };
    const request =
      this.vasPurchaseType.value === 'DATA'
        ? this.airtimeData.purchaseData(purchase)
        : this.vasPurchaseType.value === 'COMBO'
          ? this.airtimeData.purchaseCombo(purchase)
          : this.airtimeData.purchaseAirtime(purchase);
    request.subscribe((completed) => {
      this.finishVasPurchase(
        amount,
        `${completed.purchaseType} purchase: ${completed.cellphoneNumber}`,
        completed.reference
      );
      this.saveCurrentVasBeneficiary(
        completed.purchaseType === 'DATA' ? 'DATA' : 'AIRTIME'
      );
    });
  }

  onVasBuyingForChange(): void {
    const phone =
      this.vasBuyingFor.value === 'MYSELF'
        ? this.profiles.profile().telephoneNumber
        : '';
    this.vasAccount.setValue(phone);
    this.vasConfirmAccount.setValue(phone);
    this.vasRecipientName.setValue('');
    this.vasSelectedBeneficiary.setValue('');
  }

  onVasNetworkChange(): void {
    this.vasBundleName.setValue('');
    this.loadVasBundles();
  }

  selectVasBundle(): void {
    const bundle = this.vasBundles().find(
      ({ bundleName }) => bundleName === this.vasBundleName.value
    );
    if (bundle) {
      this.vasAmount.setValue(String(bundle.price));
    }
  }

  selectVasBeneficiary(): void {
    const beneficiary = this.savedVasBeneficiaries().find(
      ({ id }) => id === this.vasSelectedBeneficiary.value
    );
    if (!beneficiary) return;
    this.vasBuyingFor.setValue('SOMEONE_ELSE');
    this.vasRecipientName.setValue(beneficiary.beneficiaryName);
    const account = beneficiary.cellphoneNumber ?? beneficiary.meterNumber ?? '';
    this.vasAccount.setValue(account);
    this.vasConfirmAccount.setValue(account);
    if (beneficiary.network) {
      this.vasNetwork.setValue(
        beneficiary.network as AirtimeDataPurchase['network']
      );
      this.loadVasBundles();
    }
    if (beneficiary.provider) this.vasProvider.setValue(beneficiary.provider);
  }

  deleteSelectedVasBeneficiary(): void {
    const beneficiaryId = this.vasSelectedBeneficiary.value;
    if (!beneficiaryId) return;
    this.beneficiaries
      .deleteBeneficiary(beneficiaryId, this.currentUserId())
      .subscribe(() => {
        this.vasSelectedBeneficiary.setValue('');
        this.loadVasBeneficiaries();
      });
  }

  private finishVasPurchase(amount: number, description: string, reference: string): void {
    this.walletBalance.update((balance) => balance - amount);
    this.walletTransactions.update((transactions) => [
      { description, date: 'Today', amount: -amount },
      ...transactions
    ]);
    this.subscriptionError.set('');
    this.vasPurchaseComplete.set(`Purchase successful. Reference ${reference}`);
  }

  private saveCurrentVasBeneficiary(
    beneficiaryType: SavedBeneficiary['beneficiaryType']
  ): void {
    if (!this.vasSaveBeneficiary.value || this.vasBuyingFor.value !== 'SOMEONE_ELSE') {
      return;
    }
    this.beneficiaries.addBeneficiary({
      userId: this.currentUserId(),
      beneficiaryName: this.vasRecipientName.value.trim() || 'Saved recipient',
      beneficiaryType,
      cellphoneNumber:
        beneficiaryType === 'ELECTRICITY' ? undefined : this.vasAccount.value.trim(),
      network:
        beneficiaryType === 'ELECTRICITY' ? undefined : this.vasNetwork.value,
      meterNumber:
        beneficiaryType === 'ELECTRICITY' ? this.vasAccount.value.trim() : undefined,
      provider:
        beneficiaryType === 'ELECTRICITY' ? this.vasProvider.value : undefined
    }).subscribe(() => this.loadVasBeneficiaries());
  }

  private loadVasBeneficiaries(): void {
    this.beneficiaries
      .getSavedBeneficiaries(this.currentUserId())
      .subscribe((items) => this.savedVasBeneficiaries.set(items));
  }

  private loadVasBundles(): void {
    this.airtimeData
      .getDataBundles(this.vasNetwork.value)
      .subscribe((bundles) => this.vasBundles.set(bundles));
  }

  vasPurchaseEnabled(service: Service): boolean {
    return service.code === 'vas-services' && Boolean(this.subscriptionFor(service.code));
  }

  resetServices(): void {
    if (
      this.resetLoading() ||
      !window.confirm(
        'Reset all subscribed services and applications so you can start again?'
      )
    ) {
      return;
    }

    this.resetLoading.set(true);
    this.auth.resetServiceSubscriptions().subscribe({
      next: () => {
        this.subscriptions.set([]);
        this.stepUpApplicationStatus.set(null);
        this.selectedService.set(null);
        this.resetLoading.set(false);
      },
      error: () => {
        this.resetLoading.set(false);
        window.alert('The services could not be reset. Please try again.');
      }
    });
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

  toggleAssistant(): void {
    this.assistantOpen.update((open) => !open);
  }

  askAssistant(): void {
    const question = this.assistantQuestion.value.trim();

    if (!question) {
      return;
    }

    this.assistantMessages.update((messages) => [
      ...messages,
      { role: 'user', text: question },
      { role: 'assistant', text: this.answerAssistantQuestion(question) }
    ]);
    this.assistantQuestion.setValue('');
  }

  askSuggestedQuestion(question: string): void {
    this.assistantQuestion.setValue(question);
    this.askAssistant();
  }

  private answerAssistantQuestion(question: string): string {
    const normalized = question.toLowerCase();

    if (normalized.includes('funeral')) {
      return 'Funeral Services costs R50 for a single subscription or R75 for a family subscription. Select Explore on the Funeral Services card to choose a plan.';
    }

    if (normalized.includes('job') || normalized.includes('employment') || normalized.includes('work')) {
      return 'Job Search is free to activate and helps you browse local job listings and employment opportunities.';
    }

    if (normalized.includes('wallet') || normalized.includes('send money') || normalized.includes('receive money')) {
      return 'Wallet is free to activate. It is designed for sending money to and receiving money from other community members.';
    }

    if (normalized.includes('referr')) {
      return 'Referral is free. You can earn R0.50 per month for every active member you refer.';
    }

    if (normalized.includes('community') || normalized.includes('friend')) {
      return 'My Community is free and opens your church dashboard, announcements, events and member chat.';
    }

    if (normalized.includes('airtime') || normalized.includes('data') || normalized.includes('electricity') || normalized.includes('vas')) {
      return 'VAS Services lets you buy airtime or data and prepaid electricity from one place.';
    }

    if (normalized.includes('education') || normalized.includes('eduu') || normalized.includes('learn')) {
      return 'EduU is a free education service with learning resources and opportunities to help you grow.';
    }

    if (normalized.includes('vuma') || normalized.includes('fibre') || normalized.includes('internet')) {
      return 'Vuma Fibre lets you explore fast home fibre connectivity and register an enquiry.';
    }

    if (normalized.includes('ride') || normalized.includes('lift') || normalized.includes('transport')) {
      return 'Catch a Ride is free to activate and helps community members find or offer local rides.';
    }

    if (normalized.includes('kzncc') || normalized.includes('christian council')) {
      return 'KZNCC membership costs R7 per month and gives access to KZNCC community services and member advantages.';
    }

    if (normalized.includes('buy and sell') || normalized.includes('exchange products')) {
      return 'Buy and Sell is free to activate and lets community members buy, sell and exchange products.';
    }

    if (normalized.includes('subscribe') || normalized.includes('service')) {
      return 'Choose a service card and select Subscribe. Free services activate immediately, while paid services show their available plan and price.';
    }

    return 'I can help with Funeral Services, Job Search, Wallet, Referral, My Community, VAS Services, EduU, Vuma Fibre, Catch a Ride and Buy and Sell.';
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
