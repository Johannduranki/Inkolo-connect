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

function propertySeed() {
  return [
    {
      id: 'property-001',
      title: 'Two-bedroom apartment to rent',
      description:
        'Secure apartment close to shops and public transport. Water is included.',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      price: 6800,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: 1,
      area: 'Durban Central',
      address: 'Durban Central, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '2',
      ownerName: 'Nandi Mthembu',
      ownerTelephone: '0725550184',
      ownerCommunityName: 'Grace Community Church - Durban Central Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-11T08:30:00'
    },
    {
      id: 'property-002',
      title: 'Family home for sale',
      description:
        'Three-bedroom family home with a fitted kitchen, garden and secure parking.',
      listingType: 'SALE',
      propertyType: 'HOUSE',
      price: 895000,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 2,
      area: 'KwaDukuza',
      address: 'KwaDukuza, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '3',
      ownerName: 'Thabo Khumalo',
      ownerTelephone: '0736614209',
      ownerCommunityName: 'Zion Revival Church - KwaDukuza Central Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-10T12:15:00'
    },
    {
      id: 'property-003',
      title: 'Student room available',
      description:
        'Private room in a shared home. Electricity, water and Wi-Fi are included.',
      listingType: 'RENT',
      propertyType: 'ROOM',
      price: 2600,
      bedrooms: 1,
      bathrooms: 1,
      parkingSpaces: 0,
      area: 'Umlazi',
      address: 'Umlazi, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '4',
      ownerName: 'Lerato Sithole',
      ownerTelephone: '0789441132',
      ownerCommunityName: 'New Born Church',
      status: 'AVAILABLE',
      createdAt: '2026-06-09T15:00:00'
    },
    {
      id: 'property-004',
      title: 'Furnished room near transport',
      description: 'Neat furnished room with shared kitchen and bathroom. Water and Wi-Fi included.',
      listingType: 'RENT',
      propertyType: 'ROOM',
      price: 2300,
      bedrooms: 1,
      bathrooms: 1,
      parkingSpaces: 0,
      area: 'KwaMashu',
      address: 'KwaMashu, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '9',
      ownerName: 'Bongani Zulu',
      ownerTelephone: '0714101001',
      ownerCommunityName: 'Grace Community Church - Durban Central Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-12T09:20:00'
    },
    {
      id: 'property-005',
      title: 'Private room for a working professional',
      description: 'Private outside room in a quiet family property with secure access and prepaid electricity.',
      listingType: 'RENT',
      propertyType: 'ROOM',
      price: 2800,
      bedrooms: 1,
      bathrooms: 1,
      parkingSpaces: 1,
      area: 'Pinetown',
      address: 'Pinetown, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '10',
      ownerName: 'Nomusa Khumalo',
      ownerTelephone: '0714101002',
      ownerCommunityName: 'Zion Revival Church - Pinetown Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-12T08:45:00'
    },
    {
      id: 'property-006',
      title: 'Affordable room close to college',
      description: 'Clean room with a private entrance, shared bathroom and easy access to local taxis.',
      listingType: 'RENT',
      propertyType: 'ROOM',
      price: 1950,
      bedrooms: 1,
      bathrooms: 1,
      parkingSpaces: 0,
      area: 'Umlazi',
      address: 'Umlazi V Section, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '11',
      ownerName: 'Sibusiso Dlamini',
      ownerTelephone: '0714101003',
      ownerCommunityName: 'New Born Church',
      status: 'AVAILABLE',
      createdAt: '2026-06-11T17:30:00'
    },
    {
      id: 'property-007',
      title: 'Two-bedroom starter house',
      description: 'Secure two-bedroom house with a fitted kitchen, fenced yard and prepaid utilities.',
      listingType: 'RENT',
      propertyType: 'HOUSE',
      price: 5200,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: 1,
      area: 'Phoenix',
      address: 'Phoenix, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '12',
      ownerName: 'Thandeka Mthembu',
      ownerTelephone: '0714101004',
      ownerCommunityName: 'Grace Community Church - Durban Central Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-12T10:10:00'
    },
    {
      id: 'property-008',
      title: 'Three-bedroom family house',
      description: 'Spacious family house with two bathrooms, a garden and secure off-street parking.',
      listingType: 'RENT',
      propertyType: 'HOUSE',
      price: 8500,
      bedrooms: 3,
      bathrooms: 2,
      parkingSpaces: 2,
      area: 'Newlands West',
      address: 'Newlands West, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '13',
      ownerName: 'Mandla Ngcobo',
      ownerTelephone: '0714101005',
      ownerCommunityName: 'Zion Revival Church - Durban North Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-11T14:00:00'
    },
    {
      id: 'property-009',
      title: 'Modern two-bedroom home',
      description: 'Recently renovated home with an open-plan living area, fitted kitchen and covered parking.',
      listingType: 'RENT',
      propertyType: 'HOUSE',
      price: 7200,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: 1,
      area: 'Richards Bay',
      address: 'Richards Bay, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '14',
      ownerName: 'Zanele Buthelezi',
      ownerTelephone: '0714101006',
      ownerCommunityName: 'New Born Church',
      status: 'AVAILABLE',
      createdAt: '2026-06-10T16:20:00'
    },
    {
      id: 'property-010',
      title: 'Four-bedroom house with garden',
      description: 'Large home suited to a family, with a private garden, two bathrooms and double parking.',
      listingType: 'RENT',
      propertyType: 'HOUSE',
      price: 10500,
      bedrooms: 4,
      bathrooms: 2,
      parkingSpaces: 2,
      area: 'Ballito',
      address: 'Ballito, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '15',
      ownerName: 'Nhlanhla Cele',
      ownerTelephone: '0714101007',
      ownerCommunityName: 'Zion Revival Church - KwaDukuza Central Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-10T11:15:00'
    },
    {
      id: 'property-011',
      title: 'Compact house near town centre',
      description: 'Well-maintained two-bedroom home near schools, shops and public transport.',
      listingType: 'RENT',
      propertyType: 'HOUSE',
      price: 5900,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: 1,
      area: 'Pietermaritzburg',
      address: 'Pietermaritzburg Central, KwaZulu-Natal',
      images: ['/service-keycha-properties.png'],
      ownerUserId: '16',
      ownerName: 'Lindiwe Nxumalo',
      ownerTelephone: '0714101008',
      ownerCommunityName: 'Grace Community Church - Pietermaritzburg Branch',
      status: 'AVAILABLE',
      createdAt: '2026-06-09T13:40:00'
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

function availableLiftSeed() {
  return [
    {
      id: 'lift-001',
      driverUserId: '2',
      driverName: 'Nandi Mthembu',
      driverTelephone: '0725550184',
      vehicle: 'White Toyota Corolla',
      registrationNumber: 'ND 428-771',
      seatsAvailable: 3,
      rating: 4.9,
      distanceKm: 1.4,
      directionDegrees: 35,
      destination: 'Durban Central',
      departureTime: 'Leaving in 10 minutes',
      available: true
    },
    {
      id: 'lift-002',
      driverUserId: '3',
      driverName: 'Thabo Khumalo',
      driverTelephone: '0736614209',
      vehicle: 'Blue VW Polo',
      registrationNumber: 'NU 712-804',
      seatsAvailable: 2,
      rating: 4.8,
      distanceKm: 3.2,
      directionDegrees: 120,
      destination: 'Umlazi',
      departureTime: 'Leaving in 20 minutes',
      available: true
    },
    {
      id: 'lift-003',
      driverUserId: '4',
      driverName: 'Lerato Sithole',
      driverTelephone: '0789441132',
      vehicle: 'Silver Hyundai i20',
      registrationNumber: 'ND 993-215',
      seatsAvailable: 1,
      rating: 4.7,
      distanceKm: 5.6,
      directionDegrees: 225,
      destination: 'Pinetown',
      departureTime: 'Leaving in 30 minutes',
      available: true
    },
    {
      id: 'lift-004',
      driverUserId: '5',
      driverName: 'Ayanda Dlamini',
      driverTelephone: '0741002003',
      vehicle: 'Grey Suzuki Swift',
      registrationNumber: 'NU 184-550',
      seatsAvailable: 3,
      rating: 4.6,
      distanceKm: 8.3,
      directionDegrees: 300,
      destination: 'KwaMashu',
      departureTime: 'Leaving in 45 minutes',
      available: true
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
    version: 11,
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
        status: 'ACTIVE',
        branding: {
          logoUrl: '',
          primaryColor: '#12385f',
          secondaryColor: '#1876b7',
          accentColor: '#d4a62a',
          backgroundColor: '#f5f1e7'
        }
      },
      {
        id: '2',
        name: 'Zion Revival Church',
        denomination: 'Zionist',
        region: 'North Coast',
        province: 'KwaZulu-Natal',
        status: 'ACTIVE',
        branding: {
          logoUrl: '',
          primaryColor: '#3d145f',
          secondaryColor: '#7c35a5',
          accentColor: '#e1b943',
          backgroundColor: '#f8f1fb'
        }
      },
      {
        id: '3',
        name: 'New Hope Christian Centre',
        denomination: 'Pentecostal',
        region: 'South Coast',
        province: 'KwaZulu-Natal',
        status: 'ACTIVE',
        branding: {
          logoUrl: '',
          primaryColor: '#174f3f',
          secondaryColor: '#2f8d6c',
          accentColor: '#f0b73e',
          backgroundColor: '#f1f8f4'
        }
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
    propertyListings: propertySeed(),
    propertyConversations: [],
    propertyMessages: [],
    jobListings: jobSeed(),
    availableLifts: availableLiftSeed(),
    rideRequests: [],
    businessProfiles: [],
    legalAcceptances: [],
    memberDocuments: [
      {
        id: 'doc-001',
        memberId: '1',
        serviceProviderId: 'sp-001',
        serviceId: 'funeral-cover-001',
        policyNumber: 'POL-DEMO-0001',
        documentType: 'FUNERAL_COVER_POLICY',
        fileName: 'african-bank-funeral-policy.pdf',
        fileUrl: '',
        uploadedAt: '2026-06-09T00:00:00.000Z',
        uploadedBy: 'African Bank Funeral Cover',
        status: 'ACTIVE',
        expiryDate: '2027-06-09'
      }
    ]
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
    if ((loaded.version ?? 1) < 5) {
      loaded.propertyListings = loaded.propertyListings?.length
        ? loaded.propertyListings
        : propertySeed();
      loaded.propertyConversations ??= [];
      loaded.propertyMessages ??= [];
    }
    if ((loaded.version ?? 1) < 6) {
      const existingPropertyIds = new Set(
        (loaded.propertyListings ?? []).map((listing) => listing.id)
      );
      loaded.propertyListings = [
        ...(loaded.propertyListings ?? []),
        ...propertySeed().filter((listing) => !existingPropertyIds.has(listing.id))
      ];
    }
    if ((loaded.version ?? 1) < 7) {
      const normalMember = (loaded.users ?? []).find((user) => Number(user.id) === 1);
      if (normalMember) {
        normalMember.roles = (normalMember.roles ?? ['Member']).filter(
          (role) => role !== 'KZNCC User' && role !== 'KZNCC Admin'
        );
        if (!normalMember.roles.includes('Member')) {
          normalMember.roles.unshift('Member');
        }
      }
    }
    if ((loaded.version ?? 1) < 8) {
      loaded.availableLifts = loaded.availableLifts?.length
        ? loaded.availableLifts
        : availableLiftSeed();
      loaded.rideRequests ??= [];
    }
    if ((loaded.version ?? 1) < 9) {
      loaded.businessProfiles ??= [];
    }
    if ((loaded.version ?? 1) < 10) {
      const themes = [
        ['#12385f', '#1876b7', '#d4a62a', '#f5f1e7'],
        ['#3d145f', '#7c35a5', '#e1b943', '#f8f1fb'],
        ['#174f3f', '#2f8d6c', '#f0b73e', '#f1f8f4']
      ];
      (loaded.churches ?? []).forEach((church, index) => {
        const [primaryColor, secondaryColor, accentColor, backgroundColor] =
          themes[index % themes.length];
        church.branding ??= {
          logoUrl: '',
          primaryColor,
          secondaryColor,
          accentColor,
          backgroundColor
        };
      });
    }
    if ((loaded.version ?? 1) < 11) {
      loaded.memberDocuments ??= [];
    }
    loaded.version = 11;
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
