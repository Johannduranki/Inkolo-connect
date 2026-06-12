import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(moduleDirectory, '../data');
const storePath = path.join(dataDirectory, 'platform-store.json');
const temporaryStorePath = `${storePath}.tmp`;

const now = () => new Date().toISOString();

function marketplaceSeed() {
  return [
    {
      id: 'listing-001',
      title: 'Family dining table',
      description: 'Solid wooden table in good condition. Seats six people.',
      category: 'Furniture',
      productType: 'Dining room',
      condition: 'SECOND_HAND',
      price: 1800,
      area: 'Durban Central',
      images: ['/marketplace-dining-table.jpg'],
      sellerUserId: '2',
      sellerName: 'Nandi Mthembu',
      sellerChurchName: 'Grace Community Church',
      sellerBranchName: 'Durban Central Branch',
      sellerRating: 4.8,
      status: 'AVAILABLE',
      createdAt: '2026-06-08T09:30:00'
    },
    {
      id: 'listing-002',
      title: 'School laptop',
      description: 'Reliable laptop for online classes and everyday work.',
      category: 'Electronics',
      productType: 'Laptop',
      condition: 'REFURBISHED',
      price: 3200,
      area: 'KwaDukuza',
      images: ['/marketplace-laptop.jpg'],
      sellerUserId: '3',
      sellerName: 'Thabo Khumalo',
      sellerChurchName: 'Zion Revival Church',
      sellerBranchName: 'KwaDukuza Central Branch',
      sellerRating: 4.6,
      status: 'AVAILABLE',
      createdAt: '2026-06-07T14:15:00'
    },
    {
      id: 'listing-003',
      title: 'Mobile phone',
      description: 'Unlocked phone with charger. Ideal for calls and WhatsApp.',
      category: 'Phones',
      productType: 'Mobile phone',
      condition: 'USED',
      price: 1450,
      area: 'Tugela',
      images: ['/marketplace-mobile-phone.jpg'],
      sellerUserId: '4',
      sellerName: 'Lerato Sithole',
      sellerCommunityName: 'New Born Church',
      sellerRating: 4.9,
      status: 'AVAILABLE',
      createdAt: '2026-06-06T11:00:00'
    }
  ];
}

function jobSeed() {
  return [
    {
      id: 'job-001',
      title: 'Office Administrator',
      description: 'Office Administrator opportunity available to an Inkolo Connect community member.',
      category: 'Admin',
      jobType: 'Admin',
      employmentType: 'FULL_TIME',
      workMode: 'ON_SITE',
      area: 'Tugela',
      paymentAmount: 8500,
      paymentFrequency: 'MONTHLY',
      requiredSkills: ['Reliable', 'Good communication'],
      listedByUserId: '1',
      listedByUserName: 'Tugela Community Centre',
      listedByChurchName: 'New Born Church',
      listedByBranchName: 'Durban Central Branch',
      listerRating: 4.7,
      status: 'OPEN',
      createdAt: '2026-06-08T10:00:00'
    },
    {
      id: 'job-002',
      title: 'Shop Assistant',
      description: 'Shop Assistant opportunity available to an Inkolo Connect community member.',
      category: 'Sales',
      jobType: 'Sales',
      employmentType: 'PART_TIME',
      workMode: 'ON_SITE',
      area: 'KwaDukuza',
      paymentAmount: 35,
      paymentFrequency: 'HOURLY',
      requiredSkills: ['Reliable', 'Good communication'],
      listedByUserId: '2',
      listedByUserName: 'New Born Family Store',
      listedByChurchName: 'New Born Church',
      listedByBranchName: 'Durban Central Branch',
      listerRating: 4.7,
      status: 'OPEN',
      createdAt: '2026-06-08T10:00:00'
    }
  ];
}

function initialState() {
  const users = [
    [1, 'Jeremy', 'Shabalala', '0712345678', 'jeremy@inkoloconnect.local', ['Member']],
    [2, 'Nandi', 'Mthembu', '0725550184', 'nandi@inkoloconnect.local', ['Member', 'Pastor']],
    [3, 'Thabo', 'Khumalo', '0736614209', 'thabo@inkoloconnect.local', ['Member', 'Bishop']],
    [4, 'Lerato', 'Sithole', '0789441132', 'lerato@inkoloconnect.local', ['Member', 'KZNCC User']],
    [5, 'Ayanda', 'Dlamini', '0741002003', 'ayanda@inkoloconnect.local', ['Member', 'KZNCC Admin']],
    [6, 'Sipho', 'Ncube', '0763004005', 'sipho@inkoloconnect.local', ['Admin User']],
    [7, 'Zanele', 'Mkhize', '0795006007', 'zanele@africanbank.local', ['Service Provider Admin']],
    [8, 'Mandla', 'Cele', '0817008009', 'mandla@africanbank.local', ['Service Provider User']],
    [9, 'Bongani', 'Zulu', '0714101001', 'bongani.zulu@inkoloconnect.local', ['Member']],
    [10, 'Nomusa', 'Khumalo', '0714101002', 'nomusa.khumalo@inkoloconnect.local', ['Member']],
    [11, 'Sibusiso', 'Dlamini', '0714101003', 'sibusiso.dlamini@inkoloconnect.local', ['Member']],
    [12, 'Thandeka', 'Mthembu', '0714101004', 'thandeka.mthembu@inkoloconnect.local', ['Member']],
    [13, 'Mandla', 'Ngcobo', '0714101005', 'mandla.ngcobo@inkoloconnect.local', ['Member']],
    [14, 'Zanele', 'Buthelezi', '0714101006', 'zanele.buthelezi@inkoloconnect.local', ['Member']],
    [15, 'Nhlanhla', 'Cele', '0714101007', 'nhlanhla.cele@inkoloconnect.local', ['Member']],
    [16, 'Lindiwe', 'Nxumalo', '0714101008', 'lindiwe.nxumalo@inkoloconnect.local', ['Member']],
    [17, 'Themba', 'Mkhize', '0714101009', 'themba.mkhize@inkoloconnect.local', ['Member']],
    [18, 'Precious', 'Gumede', '0714101010', 'precious.gumede@inkoloconnect.local', ['Member']]
  ].map(([id, firstName, lastName, telephoneNumber, email, roles]) => ({
    id,
    firstName,
    lastName,
    telephoneNumber,
    email,
    roles,
    status: 'active'
  }));

  return {
    version: 4,
    users,
    profiles: users.map((user) => ({
      userId: user.id,
      idNumber: '',
      telephoneNumber: user.telephoneNumber,
      email: user.email,
      address: '',
      city: '',
      postalCode: '',
      emergencyContactName: '',
      emergencyContactNumber: ''
    })),
    churches: [
      {
        id: '1',
        name: 'Grace Community Church',
        denomination: 'Christian Community',
        region: 'Durban Central',
        province: 'KwaZulu-Natal',
        status: 'ACTIVE'
      },
      {
        id: '2',
        name: 'Zion Revival Church',
        denomination: 'Zionist',
        region: 'North Coast',
        province: 'KwaZulu-Natal',
        status: 'ACTIVE'
      },
      {
        id: '3',
        name: 'New Hope Christian Centre',
        denomination: 'Pentecostal',
        region: 'South Coast',
        province: 'KwaZulu-Natal',
        status: 'ACTIVE'
      }
    ],
    branches: [
      {
        id: 'branch-001',
        churchId: '1',
        branchName: 'Durban Central Branch',
        branchCode: 'GCC-DBN',
        pastorName: 'Pastor N. Mthembu',
        region: 'Durban Central',
        province: 'KwaZulu-Natal',
        physicalAddress: '14 Gospel Road, Durban',
        status: 'ACTIVE'
      },
      {
        id: 'branch-002',
        churchId: '1',
        branchName: 'Umlazi Branch',
        branchCode: 'GCC-UML',
        region: 'Durban South',
        province: 'KwaZulu-Natal',
        status: 'ACTIVE'
      },
      {
        id: 'branch-003',
        churchId: '2',
        branchName: 'KwaDukuza Central Branch',
        branchCode: 'ZRC-KWD',
        pastorName: 'Bishop T. Khumalo',
        region: 'North Coast',
        province: 'KwaZulu-Natal',
        status: 'ACTIVE'
      }
    ],
    memberCommunities: [
      {
        memberId: '1',
        churchId: '1',
        churchName: 'Grace Community Church',
        branchId: 'branch-001',
        branchName: 'Durban Central Branch'
      },
      {
        memberId: '2',
        churchId: '1',
        churchName: 'Grace Community Church',
        branchId: 'branch-001',
        branchName: 'Durban Central Branch'
      },
      {
        memberId: '3',
        churchId: '1',
        churchName: 'Grace Community Church',
        branchId: 'branch-001',
        branchName: 'Durban Central Branch'
      },
      {
        memberId: '4',
        churchId: '1',
        churchName: 'Grace Community Church',
        branchId: 'branch-001',
        branchName: 'Durban Central Branch'
      }
    ],
    contacts: [],
    directMessages: [],
    serviceSubscriptions: [],
    wallets: users.slice(0, 6).map((user) => ({
      id: `member-${user.id}`,
      ownerType: 'MEMBER',
      ownerId: String(user.id),
      walletName: `${user.firstName} ${user.lastName} Wallet`,
      balance: user.id === 1 ? 850 : 250,
      availableBalance: user.id === 1 ? 850 : 250,
      pendingBalance: 0,
      currency: 'ZAR',
      status: 'ACTIVE'
    })),
    walletTransactions: [
      {
        id: 'wallet-seed-1',
        walletId: 'member-1',
        transactionType: 'ADJUSTMENT',
        amount: 250,
        direction: 'IN',
        description: 'Community payment',
        reference: 'OPENING-001',
        status: 'SUCCESSFUL',
        createdAt: now()
      }
    ],
    referrals: [],
    marketplaceListings: marketplaceSeed(),
    marketplaceConversations: [],
    marketplaceMessages: [],
    jobListings: jobSeed(),
    legalAcceptances: []
  };
}

function loadState() {
  mkdirSync(dataDirectory, { recursive: true });
  try {
    const loaded = JSON.parse(readFileSync(storePath, 'utf8'));
    if ((loaded.version ?? 1) < 2) {
      loaded.marketplaceListings = loaded.marketplaceListings?.length
        ? loaded.marketplaceListings
        : marketplaceSeed();
      loaded.jobListings = loaded.jobListings?.length
        ? loaded.jobListings
        : jobSeed();
    }
    if ((loaded.version ?? 1) < 3) loaded.legalAcceptances ??= [];
    loaded.serviceSubscriptions ??= [];
    if ((loaded.version ?? 1) < 4) {
      loaded.marketplaceConversations ??= [];
      loaded.marketplaceMessages ??= [];
    }
    loaded.version = 4;
    writeFileSync(storePath, JSON.stringify(loaded, null, 2));
    return loaded;
  } catch {
    const state = initialState();
    writeFileSync(storePath, JSON.stringify(state, null, 2));
    return state;
  }
}

let state = loadState();

function persist() {
  writeFileSync(temporaryStorePath, JSON.stringify(state, null, 2));
  renameSync(temporaryStorePath, storePath);
}

export function readPlatformState() {
  return state;
}

export function updatePlatformState(mutator) {
  const result = mutator(state);
  persist();
  return result;
}

export function createPlatformId(prefix) {
  return `${prefix}-${randomUUID()}`;
}
