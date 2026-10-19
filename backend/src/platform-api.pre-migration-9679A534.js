import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createPlatformId, readPlatformState, updatePlatformState } from './platform-store.js';
import { resetUserServiceData } from './user-reset.js';
import { getPool } from './database.js';

const cleanPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('27') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
};

const currentUserId = (req) => String(req.auth.sub);
const conversationKey = (first, second) => [String(first), String(second)].sort().join(':');
const reportServiceNames = {
  'build-up-balance': 'Buy and Sell',
  funeral: 'Funeral Services',
  community: 'My Community',
  referral: 'Referral',
  'job-search': 'Job Search',
  'vas-services': 'VAS Services',
  eduu: 'EduU',
  'grant-distribution': 'Grant Distribution',
  'trader-training': 'Trader Training',
  'uif-trader-training': 'Trader Training',
  'community-membership': 'Community Membership',
  'vuma-fibre': 'Vuma Force',
  'catch-a-ride': 'Catch a Lift',
  kzncc: 'KZNCC',
  'keycha-properties': 'Keytcha Properties',
  wallet: 'Wallet'
};
const communityLogoDirectory = path.resolve('uploads/community-logos');
mkdirSync(communityLogoDirectory, { recursive: true });
const memberDocumentDirectory = path.resolve('uploads/member-documents');
mkdirSync(memberDocumentDirectory, { recursive: true });
const accountingInvoiceDirectory = path.resolve('uploads/accounting-invoices');
mkdirSync(accountingInvoiceDirectory, { recursive: true });

const communityLogoUpload = multer({
  storage: multer.diskStorage({
    destination: communityLogoDirectory,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    callback(
      null,
      ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)
    );
  }
});

const memberDocumentUpload = multer({
  storage: multer.diskStorage({
    destination: memberDocumentDirectory,
    filename: (_req, file, callback) => {
      callback(
        null,
        `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`
      );
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    callback(
      null,
      ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(
        file.mimetype
      )
    );
  }
});

const accountingInvoiceUpload = multer({
  storage: multer.diskStorage({
    destination: accountingInvoiceDirectory,
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, ['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype) && ['.pdf', '.png', '.jpg', '.jpeg'].includes(extension));
  }
});

function publicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    telephoneNumber: user.telephoneNumber,
    email: user.email,
    roles: user.roles
  };
}

export function createPlatformRouter({ requireAuth, databaseAvailable = false }) {
  const router = express.Router();
  router.use(requireAuth);
  const requireAdminUser = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (!user?.roles.includes('Admin User')) {
      return res.status(403).json({ message: 'Duranki Admin access is required.' });
    }
    return next();
  };
  const requireKznccAdmin = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (!user?.roles.includes('KZNCC Admin')) {
      return res.status(403).json({ message: 'KZNCC Admin access is required.' });
    }
    return next();
  };
  const requireServiceProvider = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (
      !user?.roles.some((role) =>
        ['Service Provider Admin', 'Service Provider User'].includes(role)
      )
    ) {
      return res.status(403).json({
        message: 'Service Provider access is required.'
      });
    }
    return next();
  };
  const createUser = (roles, body) => {
    const firstName = String(body?.firstName ?? '').trim();
    const lastName = String(body?.lastName ?? '').trim();
    const telephoneNumber = cleanPhone(body?.telephoneNumber);
    const email = String(body?.email ?? '').trim();
    if (!firstName || !lastName || !/^\d{10}$/.test(telephoneNumber)) {
      return { error: 'Enter a name, surname and valid 10-digit telephone number.' };
    }
    if (readPlatformState().users.some((user) => cleanPhone(user.telephoneNumber) === telephoneNumber)) {
      return { error: 'A user with this telephone number already exists.' };
    }
    return {
      user: updatePlatformState((state) => {
        const id = Math.max(0, ...state.users.map((user) => Number(user.id))) + 1;
        const created = {
          id,
          firstName,
          lastName,
          telephoneNumber,
          email,
          roles: [...new Set(roles)],
          status: 'active'
        };
        state.users.push(created);
        state.profiles.push({
          userId: id,
          idNumber: '',
          telephoneNumber,
          email,
          address: '',
          city: '',
          postalCode: '',
          emergencyContactName: '',
          emergencyContactNumber: ''
        });
        return created;
      })
    };
  };
  const removeUser = (userId) =>
    updatePlatformState((state) => {
      const index = state.users.findIndex(({ id }) => String(id) === String(userId));
      if (index < 0) return null;
      const [removed] = state.users.splice(index, 1);
      state.profiles = state.profiles.filter(
        ({ userId: profileUserId }) => String(profileUserId) !== String(userId)
      );
      state.contacts = state.contacts.filter(
        ({ ownerUserId, contactUserId }) =>
          String(ownerUserId) !== String(userId) &&
          String(contactUserId) !== String(userId)
      );
      return removed;
    });
  const businessServices = new Set([
    'BUY_SELL',
    'JOB_SEARCH',
    'KEYTCHA_PROPERTIES',
    'CATCH_A_RIDE'
  ]);
  const ownedBusiness = (state, req, businessId, service) => {
    if (!businessId) return null;
    return (state.businessProfiles ?? []).find(
      (business) =>
        business.id === String(businessId) &&
        business.ownerUserId === currentUserId(req) &&
        business.status === 'ACTIVE' &&
      business.services.includes(service)
    );
  };
  const requireTrainingAdmin = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (!user?.roles.some((role) => ['Platform Admin', 'Admin User'].includes(role))) {
      return res.status(403).json({
        message: 'Trader Training administrator access is required.'
      });
    }
    return next();
  };
  const requireAccountingAdmin = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (!user?.roles.some((role) => ['Platform Admin', 'Accountant'].includes(role))) {
      return res.status(403).json({ message: 'Accounting dashboard access is required.' });
    }
    return next();
  };
  const findTrainingProgram = (state, programmeId) =>
    (state.traderTrainingPrograms ?? []).find(({ id }) => id === programmeId);
  const findTrainingApplication = (state, programmeId, traderId) =>
    (state.traderTrainingApplications ?? []).find(
      (application) =>
        application.programmeId === programmeId &&
        String(application.traderId) === String(traderId)
    );
  const ensureMemberWallet = (state, userId) => {
    state.wallets ??= [];
    let wallet = state.wallets.find(
      ({ ownerType, ownerId }) => ownerType === 'MEMBER' && String(ownerId) === String(userId)
    );
    if (!wallet) {
      const user = state.users.find(({ id }) => String(id) === String(userId));
      wallet = {
        id: `member-${userId}`,
        ownerType: 'MEMBER',
        ownerId: String(userId),
        walletName: `${user?.firstName ?? 'Member'} ${user?.lastName ?? ''} Wallet`.trim(),
        balance: 0,
        availableBalance: 0,
        pendingBalance: 0,
        currency: 'ZAR',
        status: 'ACTIVE'
      };
      state.wallets.push(wallet);
    }
    return wallet;
  };
  const paymentMilestoneKey = (traderId, programmeId, moduleId) =>
    `${traderId}:${programmeId}:${moduleId}`;
  const scoreAttempt = (module, answers) => {
    const questions = module.questions ?? [];
    if (!questions.length) return 100;
    const correct = questions.filter((question) => {
      const selected = answers?.[question.id];
      return String(selected ?? '').trim() === String(question.correctAnswer ?? '').trim();
    }).length;
    return Math.round((correct / questions.length) * 100);
  };
  const moduleDashboardForTrader = (state, programme, traderId) => {
    const application = findTrainingApplication(state, programme.id, traderId);
    const attempts = (state.traderTrainingAttempts ?? []).filter(
      (attempt) =>
        attempt.programmeId === programme.id &&
        String(attempt.traderId) === String(traderId)
    );
    const payments = (state.traderTrainingPayments ?? []).filter(
      (payment) =>
        payment.programmeId === programme.id &&
        String(payment.traderId) === String(traderId)
    );
    const completedModuleIds = new Set(
      attempts.filter(({ passed }) => passed).map(({ moduleId }) => moduleId)
    );
    const modulesForDashboard = (programme.modules ?? [])
      .filter((module) => module.active !== false)
      .sort((first, second) => Number(first.sequence) - Number(second.sequence));
    const dashboardModules = modulesForDashboard.map((module, index, modules) => {
      const moduleAttempts = attempts
        .filter((attempt) => attempt.moduleId === module.id)
        .sort((first, second) => first.attemptNumber - second.attemptNumber);
      const passedAttempt = moduleAttempts.find(({ passed }) => passed);
      const latestAttempt = moduleAttempts[moduleAttempts.length - 1];
      const previous = modules[index - 1];
      const previousPaymentSuccessful = payments.some(
        (payment) =>
          payment.moduleId === previous?.id && payment.paymentStatus === 'Successful'
      );
      const unlocked =
        index === 0 ||
        programme.unlockRule === 'MANUAL_APPROVAL' ||
        (programme.unlockRule === 'ASSESSMENT_PASSED' && completedModuleIds.has(previous?.id)) ||
        (programme.unlockRule === 'PREVIOUS_TRAINING_COMPLETED' && completedModuleIds.has(previous?.id)) ||
        (programme.unlockRule === 'PREVIOUS_PAYMENT_SUCCESSFUL' && previousPaymentSuccessful);
      const completed = completedModuleIds.has(module.id);
      const payment = payments.find((item) => item.moduleId === module.id);
      const paymentStatus = payment?.paymentStatus === 'Successful'
        ? 'Paid'
        : completed
          ? 'Approved'
          : unlocked && application?.status === 'Approved'
            ? 'Eligible'
            : 'Locked';
      return {
        ...module,
        status: completed
          ? 'Completed'
          : unlocked && application?.status === 'Approved'
            ? moduleAttempts.length
              ? 'In Progress'
              : 'Available'
            : 'Locked',
        fundingStatus: paymentStatus,
        nextModuleUnlocked: completed && module.unlockNextAutomatically !== false,
        dateStarted: moduleAttempts[0]?.attemptedAt ?? null,
        dateCompleted: passedAttempt?.attemptedAt ?? null,
        trainingContentViewed: Boolean(latestAttempt?.trainingContentViewed),
        practicalExerciseAnswers: latestAttempt?.practicalExerciseAnswers ?? null,
        attempts: moduleAttempts,
        payment: payment ?? null
      };
    });
    const receivedAmount =
      (application?.initialFundingPaid ? Number(programme.initialFundingAmount) || 0 : 0) +
      payments
        .filter(({ paymentStatus }) => paymentStatus === 'Successful')
        .reduce((sum, payment) => sum + Number(payment.fundingAmount), 0);
    const completedModules = dashboardModules.filter(
      ({ status }) => status === 'Completed'
    ).length;
    const currentModuleName =
      dashboardModules.find(({ status }) => status === 'In Progress' || status === 'Available')
        ?.moduleName ?? '';
    return {
      ...programme,
      application,
      receivedAmount,
      remainingAmount: Math.max(0, (Number(programme.totalGrantAmount) || 0) - receivedAmount),
      completedModules,
      progressPercentage: dashboardModules.length
        ? Math.round((completedModules / dashboardModules.length) * 100)
        : 0,
      currentModuleName,
      modules: dashboardModules
    };
  };

  router.get('/businesses/mine', (req, res) => {
    res.json(
      (readPlatformState().businessProfiles ?? [])
        .filter(({ ownerUserId }) => ownerUserId === currentUserId(req))
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    );
  });

  router.post('/businesses', (req, res) => {
    const businessName = String(req.body?.businessName ?? '').trim();
    const telephone = cleanPhone(req.body?.telephone);
    const area = String(req.body?.area ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const services = [...new Set(req.body?.services ?? [])].filter((service) =>
      businessServices.has(service)
    );
    if (
      businessName.length < 2 ||
      !/^\d{10}$/.test(telephone) ||
      !area ||
      !description ||
      !services.length
    ) {
      return res.status(400).json({
        message:
          'Enter the business name, 10-digit telephone number, area, description and at least one service.'
      });
    }
    const business = updatePlatformState((state) => {
      state.businessProfiles ??= [];
      const created = {
        id: createPlatformId('business'),
        ownerUserId: currentUserId(req),
        businessName,
        registrationNumber: String(req.body?.registrationNumber ?? '').trim(),
        telephone,
        email: String(req.body?.email ?? '').trim(),
        area,
        description,
        services,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
      state.businessProfiles.unshift(created);
      return created;
    });
    return res.status(201).json(business);
  });

  router.post('/businesses/:businessId/bulk', (req, res) => {
    const service = String(req.body?.service ?? '');
    const records = Array.isArray(req.body?.records) ? req.body.records.slice(0, 100) : [];
    const state = readPlatformState();
    const business = ownedBusiness(state, req, req.params.businessId, service);
    const owner = state.users.find(({ id }) => String(id) === currentUserId(req));
    if (!business) {
      return res.status(403).json({
        message: 'This business is not registered for the selected service.'
      });
    }
    if (!records.length) {
      return res.status(400).json({ message: 'Add at least one bulk record.' });
    }

    const createdRecords = updatePlatformState((platformState) => {
      const created = [];
      for (const record of records) {
        if (service === 'BUY_SELL') {
          const title = String(record.title ?? '').trim();
          const price = Number(record.price);
          if (!title || !Number.isFinite(price) || price < 0) continue;
          const item = {
            ...record,
            id: createPlatformId('listing'),
            title,
            price,
            images: Array.isArray(record.images) ? record.images : [],
            sellerUserId: currentUserId(req),
            sellerName: business.businessName,
            businessProfileId: business.id,
            businessName: business.businessName,
            area: String(record.area ?? business.area),
            status: 'AVAILABLE',
            createdAt: new Date().toISOString()
          };
          platformState.marketplaceListings.unshift(item);
          created.push(item);
        } else if (service === 'JOB_SEARCH') {
          const title = String(record.title ?? '').trim();
          if (!title) continue;
          const item = {
            ...record,
            id: createPlatformId('job'),
            title,
            listedByUserId: currentUserId(req),
            listedByUserName: business.businessName,
            businessProfileId: business.id,
            businessName: business.businessName,
            area: String(record.area ?? business.area),
            status: 'OPEN',
            createdAt: new Date().toISOString()
          };
          platformState.jobListings.unshift(item);
          created.push(item);
        } else if (service === 'KEYTCHA_PROPERTIES') {
          const title = String(record.title ?? '').trim();
          const price = Number(record.price);
          if (!title || !Number.isFinite(price) || price <= 0) continue;
          const item = {
            ...record,
            id: createPlatformId('property'),
            title,
            price,
            images: Array.isArray(record.images) ? record.images : [],
            ownerUserId: currentUserId(req),
            ownerName: business.businessName,
            ownerTelephone: business.telephone,
            businessProfileId: business.id,
            businessName: business.businessName,
            area: String(record.area ?? business.area),
            status: 'AVAILABLE',
            createdAt: new Date().toISOString()
          };
          platformState.propertyListings ??= [];
          platformState.propertyListings.unshift(item);
          created.push(item);
        } else if (service === 'CATCH_A_RIDE') {
          const vehicle = String(record.vehicle ?? '').trim();
          const registrationNumber = String(record.registrationNumber ?? '').trim();
          if (!vehicle || !registrationNumber) continue;
          const item = {
            id: createPlatformId('lift'),
            driverUserId: currentUserId(req),
            driverName: business.businessName,
            driverTelephone: business.telephone || owner?.telephoneNumber,
            vehicle,
            registrationNumber,
            seatsAvailable: Math.max(1, Number(record.seatsAvailable) || 1),
            rating: 5,
            distanceKm: Math.min(10, Math.max(0.5, Number(record.distanceKm) || 4)),
            directionDegrees: Number(record.directionDegrees) || 90,
            destination: String(record.destination ?? business.area),
            departureTime: String(record.departureTime ?? 'Available now'),
            businessProfileId: business.id,
            businessName: business.businessName,
            available: true
          };
          platformState.availableLifts ??= [];
          platformState.availableLifts.unshift(item);
          created.push(item);
        }
      }
      return created;
    });
    return res.status(201).json({
      created: createdRecords.length,
      records: createdRecords
    });
  });

  router.get('/trader-training/programmes', (req, res) => {
    const communityId = String(req.query.communityId ?? '').trim();
    const programmes = (readPlatformState().traderTrainingPrograms ?? [])
      .filter((programme) => !communityId || programme.communityId === communityId)
      .sort((first, second) => first.programmeName.localeCompare(second.programmeName));
    return res.json(programmes);
  });

  router.post('/trader-training/programmes', requireTrainingAdmin, (req, res) => {
    const programmeName = String(req.body?.programmeName ?? '').trim();
    const tenantId = String(req.body?.tenantId ?? 'tenant-trader-connect').trim();
    const communityId = String(req.body?.communityId ?? '').trim();
    const totalGrantAmount = Number(req.body?.totalGrantAmount);
    if (!programmeName || !communityId || !Number.isFinite(totalGrantAmount) || totalGrantAmount <= 0) {
      return res.status(400).json({
        message: 'Enter a programme name, community and valid total grant amount.'
      });
    }
    const programme = updatePlatformState((state) => {
      const created = {
        id: createPlatformId('trader-training-programme'),
        tenantId,
        communityId,
        serviceCode: 'trader-training',
        programmeName,
        programmeDescription: String(req.body?.programmeDescription ?? '').trim(),
        fundingOrganisation: String(req.body?.fundingOrganisation ?? '').trim(),
        totalGrantAmount,
        applicationStartDate: String(req.body?.applicationStartDate ?? ''),
        applicationClosingDate: String(req.body?.applicationClosingDate ?? ''),
        programmeStartDate: String(req.body?.programmeStartDate ?? ''),
        programmeEndDate: String(req.body?.programmeEndDate ?? ''),
        maximumBeneficiaries: Number(req.body?.maximumBeneficiaries) || 0,
        programmeStatus: String(req.body?.programmeStatus ?? 'Draft'),
        termsAndConditions: String(req.body?.termsAndConditions ?? '').trim(),
        requiredDocuments: Array.isArray(req.body?.requiredDocuments) ? req.body.requiredDocuments : [],
        eligibilityRequirements: Array.isArray(req.body?.eligibilityRequirements) ? req.body.eligibilityRequirements : [],
        initialFundingOnApproval: Boolean(req.body?.initialFundingOnApproval),
        initialFundingAmount: Number(req.body?.initialFundingAmount) || 0,
        defaultPassPercentage: Number(req.body?.defaultPassPercentage) || 100,
        unlockRule: String(req.body?.unlockRule ?? 'ASSESSMENT_PASSED'),
        paymentRule: String(req.body?.paymentRule ?? 'AUTOMATIC_AFTER_PASS'),
        modules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.traderTrainingPrograms ??= [];
      state.traderTrainingPrograms.push(created);
      return created;
    });
    return res.status(201).json(programme);
  });

  router.get('/trader-training/programmes/:programmeId', (req, res) => {
    const state = readPlatformState();
    const programme = findTrainingProgram(state, req.params.programmeId);
    if (!programme) return res.status(404).json({ message: 'Trader Training programme not found.' });
    return res.json(moduleDashboardForTrader(state, programme, currentUserId(req)));
  });

  router.patch('/trader-training/programmes/:programmeId', requireTrainingAdmin, (req, res) => {
    const result = updatePlatformState((state) => {
      const programme = findTrainingProgram(state, req.params.programmeId);
      if (!programme) return null;
      const textFields = [
        'programmeName',
        'programmeDescription',
        'fundingOrganisation',
        'applicationStartDate',
        'applicationClosingDate',
        'programmeStartDate',
        'programmeEndDate',
        'programmeStatus',
        'termsAndConditions',
        'unlockRule',
        'paymentRule'
      ];
      textFields.forEach((field) => {
        if (req.body?.[field] !== undefined) programme[field] = String(req.body[field]);
      });
      ['totalGrantAmount', 'maximumBeneficiaries', 'initialFundingAmount', 'defaultPassPercentage'].forEach((field) => {
        if (req.body?.[field] !== undefined) programme[field] = Number(req.body[field]) || 0;
      });
      if (req.body?.initialFundingOnApproval !== undefined) {
        programme.initialFundingOnApproval = Boolean(req.body.initialFundingOnApproval);
      }
      if (Array.isArray(req.body?.requiredDocuments)) programme.requiredDocuments = req.body.requiredDocuments;
      if (Array.isArray(req.body?.eligibilityRequirements)) programme.eligibilityRequirements = req.body.eligibilityRequirements;
      const allocated =
        (Number(programme.initialFundingAmount) || 0) +
        (programme.modules ?? []).reduce((sum, module) => sum + (Number(module.fundingAmount) || 0), 0);
      if (allocated > Number(programme.totalGrantAmount)) {
        return { error: 'Funding allocation cannot exceed the total grant amount.' };
      }
      programme.updatedAt = new Date().toISOString();
      return programme;
    });
    if (!result) return res.status(404).json({ message: 'Trader Training programme not found.' });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.json(result);
  });

  router.post('/trader-training/programmes/:programmeId/modules', requireTrainingAdmin, (req, res) => {
    const moduleName = String(req.body?.moduleName ?? '').trim();
    const fundingAmount = Number(req.body?.fundingAmount) || 0;
    if (!moduleName) return res.status(400).json({ message: 'Enter a module name.' });
    const result = updatePlatformState((state) => {
      const programme = findTrainingProgram(state, req.params.programmeId);
      if (!programme) return null;
      const allocated =
        (Number(programme.initialFundingAmount) || 0) +
        (programme.modules ?? []).reduce((sum, module) => sum + (Number(module.fundingAmount) || 0), 0) +
        fundingAmount;
      if (allocated > Number(programme.totalGrantAmount)) {
        return { error: 'Funding allocation cannot exceed the total grant amount.' };
      }
      const module = {
        id: createPlatformId('trader-training-module'),
        sequence: Number(req.body?.sequence) || (programme.modules ?? []).length + 1,
        moduleName,
        moduleDescription: String(req.body?.moduleDescription ?? '').trim(),
        trainingContent: String(req.body?.trainingContent ?? '').trim(),
        documents: Array.isArray(req.body?.documents) ? req.body.documents : [],
        images: Array.isArray(req.body?.images) ? req.body.images : [],
        videos: Array.isArray(req.body?.videos) ? req.body.videos : [],
        links: Array.isArray(req.body?.links) ? req.body.links : [],
        instructions: String(req.body?.instructions ?? '').trim(),
        requiredPassPercentage: Number(req.body?.requiredPassPercentage) || Number(programme.defaultPassPercentage) || 100,
        fundingAmount,
        unlockNextAutomatically: req.body?.unlockNextAutomatically !== false,
        payAutomaticallyAfterPass: req.body?.payAutomaticallyAfterPass !== false,
        active: req.body?.active !== false,
        estimatedDuration: String(req.body?.estimatedDuration ?? '').trim(),
        questions: Array.isArray(req.body?.questions) ? req.body.questions : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      programme.modules ??= [];
      programme.modules.push(module);
      programme.modules.sort((first, second) => first.sequence - second.sequence);
      programme.updatedAt = module.updatedAt;
      return module;
    });
    if (!result) return res.status(404).json({ message: 'Trader Training programme not found.' });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(result);
  });

  router.post('/trader-training/programmes/:programmeId/applications', (req, res) => {
    const application = updatePlatformState((state) => {
      const programme = findTrainingProgram(state, req.params.programmeId);
      if (!programme) return null;
      state.traderTrainingApplications ??= [];
      const existing = findTrainingApplication(state, programme.id, currentUserId(req));
      if (existing) return existing;
      const created = {
        id: createPlatformId('trader-training-application'),
        programmeId: programme.id,
        tenantId: programme.tenantId,
        communityId: programme.communityId,
        traderId: currentUserId(req),
        businessName: String(req.body?.businessName ?? '').trim(),
        motivation: String(req.body?.motivation ?? '').trim(),
        documents: Array.isArray(req.body?.documents) ? req.body.documents : [],
        status: 'Submitted',
        initialFundingPaid: false,
        submittedAt: new Date().toISOString(),
        reviewedAt: null
      };
      state.traderTrainingApplications.push(created);
      return created;
    });
    if (!application) return res.status(404).json({ message: 'Trader Training programme not found.' });
    return res.status(201).json(application);
  });

  router.patch('/trader-training/applications/:applicationId/review', requireTrainingAdmin, (req, res) => {
    const status = String(req.body?.status ?? '').trim();
    if (!['Approved', 'Rejected', 'Under Review', 'Additional Information Required', 'Suspended'].includes(status)) {
      return res.status(400).json({ message: 'Choose a valid application review status.' });
    }
    const result = updatePlatformState((state) => {
      const application = (state.traderTrainingApplications ?? []).find(({ id }) => id === req.params.applicationId);
      if (!application) return null;
      const programme = findTrainingProgram(state, application.programmeId);
      application.status = status;
      application.reviewedAt = new Date().toISOString();
      application.reviewedBy = currentUserId(req);
      if (
        programme &&
        status === 'Approved' &&
        programme.initialFundingOnApproval &&
        !application.initialFundingPaid &&
        Number(programme.initialFundingAmount) > 0
      ) {
        const wallet = ensureMemberWallet(state, application.traderId);
        wallet.balance += Number(programme.initialFundingAmount);
        wallet.availableBalance += Number(programme.initialFundingAmount);
        const reference = `TT-${application.traderId}-${programme.id}-APPROVAL`;
        state.walletTransactions ??= [];
        state.walletTransactions.push({
          id: createPlatformId('tx'),
          walletId: wallet.id,
          transactionType: 'TRADER_TRAINING_GRANT',
          amount: Number(programme.initialFundingAmount),
          direction: 'IN',
          description: 'Trader Training - Application approval funding',
          reference,
          status: 'SUCCESSFUL',
          createdAt: new Date().toISOString()
        });
        application.initialFundingPaid = true;
        application.initialFundingReference = reference;
      }
      return application;
    });
    if (!result) return res.status(404).json({ message: 'Trader Training application not found.' });
    return res.json(result);
  });

  router.post('/trader-training/programmes/:programmeId/modules/:moduleId/attempts', (req, res) => {
    const result = updatePlatformState((state) => {
      const programme = findTrainingProgram(state, req.params.programmeId);
      const module = programme?.modules?.find(({ id }) => id === req.params.moduleId);
      const application = programme ? findTrainingApplication(state, programme.id, currentUserId(req)) : null;
      if (!programme || !module) return null;
      if (application?.status !== 'Approved') {
        return { error: 'Your Trader Training application must be approved before taking assessments.' };
      }
      state.traderTrainingAttempts ??= [];
      state.traderTrainingPayments ??= [];
      const moduleAttempts = state.traderTrainingAttempts.filter(
        (attempt) =>
          attempt.programmeId === programme.id &&
          attempt.moduleId === module.id &&
          attempt.traderId === currentUserId(req)
      );
      const score = scoreAttempt(module, req.body?.answers ?? {});
      const passed = score >= Number(module.requiredPassPercentage);
      const attempt = {
        id: createPlatformId('trader-training-attempt'),
        traderId: currentUserId(req),
        programmeId: programme.id,
        moduleId: module.id,
        attemptNumber: moduleAttempts.length + 1,
        answers: req.body?.answers ?? {},
        practicalExerciseAnswers: req.body?.practicalExerciseAnswers ?? {},
        trainingContentViewed: req.body?.trainingContentViewed !== false,
        score,
        passed,
        timeTaken: String(req.body?.timeTaken ?? '').trim(),
        attemptedAt: new Date().toISOString()
      };
      state.traderTrainingAttempts.push(attempt);

      let payment = null;
      if (passed && module.payAutomaticallyAfterPass && Number(module.fundingAmount) > 0) {
        const milestoneKey = paymentMilestoneKey(currentUserId(req), programme.id, module.id);
        payment = state.traderTrainingPayments.find(
          (item) => item.milestoneKey === milestoneKey && item.paymentStatus === 'Successful'
        );
        if (!payment) {
          const wallet = ensureMemberWallet(state, currentUserId(req));
          wallet.balance += Number(module.fundingAmount);
          wallet.availableBalance += Number(module.fundingAmount);
          const reference = `TT-${currentUserId(req)}-${programme.id}-${module.sequence}`;
          const transaction = {
            id: createPlatformId('tx'),
            walletId: wallet.id,
            transactionType: 'TRADER_TRAINING_GRANT',
            amount: Number(module.fundingAmount),
            direction: 'IN',
            description: `Trader Training - Module ${module.sequence} Completion`,
            reference,
            status: 'SUCCESSFUL',
            createdAt: new Date().toISOString()
          };
          state.walletTransactions ??= [];
          state.walletTransactions.push(transaction);
          payment = {
            id: createPlatformId('trader-training-payment'),
            milestoneKey,
            traderId: currentUserId(req),
            programmeId: programme.id,
            moduleId: module.id,
            fundingAmount: Number(module.fundingAmount),
            walletId: wallet.id,
            paymentDate: transaction.createdAt,
            paymentStatus: 'Successful',
            paymentReference: reference,
            walletTransactionId: transaction.id,
            reason: `Trader Training - Module ${module.sequence} Completion`
          };
          state.traderTrainingPayments.push(payment);
        }
      }
      return { attempt, payment, dashboard: moduleDashboardForTrader(state, programme, currentUserId(req)) };
    });
    if (!result) return res.status(404).json({ message: 'Trader Training module not found.' });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(result);
  });

  router.get('/trader-training/me', (req, res) => {
    const state = readPlatformState();
    return res.json(
      (state.traderTrainingPrograms ?? []).map((programme) =>
        moduleDashboardForTrader(state, programme, currentUserId(req))
      )
    );
  });

  router.get('/trader-training/admin/overview', requireTrainingAdmin, (req, res) => {
    const state = readPlatformState();
    const communityId = String(req.query.communityId ?? '').trim();
    const programmes = (state.traderTrainingPrograms ?? []).filter(
      (programme) => !communityId || programme.communityId === communityId
    );
    const programmeIds = new Set(programmes.map(({ id }) => id));
    const applications = (state.traderTrainingApplications ?? []).filter(
      ({ programmeId }) => programmeIds.has(programmeId)
    );
    const attempts = (state.traderTrainingAttempts ?? []).filter(
      ({ programmeId }) => programmeIds.has(programmeId)
    );
    const payments = (state.traderTrainingPayments ?? []).filter(
      ({ programmeId }) => programmeIds.has(programmeId)
    );
    const totalGrantBudget = programmes.reduce(
      (sum, programme) => sum + Number(programme.totalGrantAmount) * Number(programme.maximumBeneficiaries || 0),
      0
    );
    const grantDistributed = payments
      .filter(({ paymentStatus }) => paymentStatus === 'Successful')
      .reduce((sum, payment) => sum + Number(payment.fundingAmount), 0);
    return res.json({
      programmes,
      totalApplications: applications.length,
      approvedApplicants: applications.filter(({ status }) => status === 'Approved').length,
      rejectedApplicants: applications.filter(({ status }) => status === 'Rejected').length,
      activeTrainees: new Set(applications.filter(({ status }) => status === 'Approved').map(({ traderId }) => traderId)).size,
      programmeCompletions: 0,
      totalGrantBudget,
      grantAllocated: applications.filter(({ status }) => status === 'Approved').length * (programmes[0]?.totalGrantAmount ?? 0),
      grantDistributed,
      remainingGrantFunds: totalGrantBudget - grantDistributed,
      pendingPayments: payments.filter(({ paymentStatus }) => paymentStatus === 'Pending').length,
      failedPayments: payments.filter(({ paymentStatus }) => paymentStatus === 'Failed').length,
      failedAssessments: attempts.filter(({ passed }) => !passed).length,
      assessmentRetries: attempts.filter(({ attemptNumber }) => attemptNumber > 1).length
    });
  });

  router.get('/profile', (req, res) => {
    const profile = readPlatformState().profiles.find(
      ({ userId }) => String(userId) === currentUserId(req)
    );
    res.json(profile ?? null);
  });

  router.put('/profile', (req, res) => {
    const userId = Number(req.auth.sub);
    const allowedFields = [
      'profilePhoto',
      'idNumber',
      'telephoneNumber',
      'email',
      'address',
      'city',
      'postalCode',
      'emergencyContactName',
      'emergencyContactNumber'
    ];
    const profile = updatePlatformState((state) => {
      const existing = state.profiles.find((item) => item.userId === userId);
      const updates = Object.fromEntries(
        allowedFields.map((field) => [field, String(req.body?.[field] ?? '').trim()])
      );
      if (existing) {
        Object.assign(existing, updates);
        return existing;
      }
      const created = { userId, ...updates };
      state.profiles.push(created);
      return created;
    });
    res.json(profile);
  });

  router.get('/roles', (req, res) => {
    const user = readPlatformState().users.find(({ id }) => String(id) === currentUserId(req));
    res.json(user?.roles ?? ['Member']);
  });

  router.get('/admin/users', requireAdminUser, (req, res) => {
    res.json(readPlatformState().users.map(publicUser));
  });

  router.get('/admin/users/:userId/profile', requireAdminUser, (req, res) => {
    const state = readPlatformState();
    const user = state.users.find(
      ({ id }) => String(id) === req.params.userId
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const profile = state.profiles.find(
      ({ userId }) => String(userId) === req.params.userId
    );
    const community = (state.memberCommunities ?? []).find(
      ({ memberId }) => String(memberId) === req.params.userId
    );
    return res.json({
      ...publicUser(user),
      profile: profile ?? null,
      community: community ?? null
    });
  });

  router.get('/admin/analytics', requireAdminUser, (_req, res) => {
    const state = readPlatformState();
    const activeUsers = state.users.filter(({ status }) => status === 'active');
    let subscriptions = state.serviceSubscriptions ?? [];

    if (!subscriptions.length) {
      const uniqueAcceptedServices = new Map();
      for (const acceptance of state.legalAcceptances ?? []) {
        const key = `${acceptance.userId}:${acceptance.serviceCode}`;
        uniqueAcceptedServices.set(key, {
          userId: acceptance.userId,
          serviceCode: acceptance.serviceCode
        });
      }
      subscriptions = [...uniqueAcceptedServices.values()];
    }

    const counts = new Map();
    for (const subscription of subscriptions) {
      counts.set(
        subscription.serviceCode,
        (counts.get(subscription.serviceCode) ?? 0) + 1
      );
    }

    res.json({
      totalMembers: activeUsers.filter(({ roles }) => roles.includes('Member')).length,
      totalRegisteredUsers: activeUsers.length,
      totalActiveSubscriptions: subscriptions.length,
      subscriptionsByService: [...counts.entries()]
        .map(([serviceCode, count]) => ({ serviceCode, count }))
        .sort((a, b) => b.count - a.count || a.serviceCode.localeCompare(b.serviceCode))
    });
  });

  router.get(
    '/admin/reports/paid-members',
    requireAdminUser,
    async (req, res, next) => {
      try {
        const state = readPlatformState();
        const reportType = String(req.query.reportType ?? 'BY_CHURCH');
        const month = String(req.query.month ?? '');
        const churchId = String(req.query.churchId ?? '');
        const serviceCode = String(req.query.serviceCode ?? '');
        const usersById = new Map(
          state.users.map((user) => [String(user.id), user])
        );
        const communitiesByMemberId = new Map(
          (state.memberCommunities ?? []).map((community) => [
            String(community.memberId),
            community
          ])
        );
        let subscriptions = state.serviceSubscriptions ?? [];

        if (databaseAvailable) {
          const [databaseSubscriptions] = await getPool().execute(
            `SELECT ss.user_id AS userId, ss.service_code AS serviceCode,
                    ss.plan_code AS planCode, ss.amount_cents AS amountCents,
                    ss.status, ss.created_at AS subscribedAt,
                    u.first_name AS firstName, u.last_name AS lastName
               FROM service_subscriptions ss
               JOIN users u ON u.id = ss.user_id
              WHERE ss.status = 'active' AND ss.amount_cents > 0`
          );
          subscriptions = databaseSubscriptions.map((subscription) => ({
            ...subscription,
            subscribedAt:
              subscription.subscribedAt instanceof Date
                ? subscription.subscribedAt.toISOString()
                : String(subscription.subscribedAt ?? ''),
            databaseUser: {
              firstName: subscription.firstName,
              lastName: subscription.lastName
            }
          }));
        }

        let rows = subscriptions
          .filter(
            (subscription) =>
              subscription.status === 'active' &&
              Number(subscription.amountCents) > 0
          )
          .map((subscription) => {
            const user =
              usersById.get(String(subscription.userId)) ??
              subscription.databaseUser;
            const community = communitiesByMemberId.get(
              String(subscription.userId)
            );
            const subscribedAt = String(subscription.subscribedAt ?? '');
            return {
              userId: String(subscription.userId),
              memberName: user
                ? `${user.firstName} ${user.lastName}`
                : `Member ${subscription.userId}`,
              telephoneNumber: user?.telephoneNumber ?? '',
              churchId: String(community?.churchId ?? ''),
              churchName: community?.churchName ?? 'No church selected',
              branchName: community?.branchName ?? '',
              serviceCode: subscription.serviceCode,
              serviceName:
                reportServiceNames[subscription.serviceCode] ??
                subscription.planLabel ??
                subscription.serviceCode,
              planLabel: subscription.planLabel ?? subscription.planCode,
              amountCents: Number(subscription.amountCents),
              paidAt: subscribedAt,
              paidMonth: subscribedAt.slice(0, 7),
              paymentStatus: 'PAID'
            };
          });

        if (month) rows = rows.filter((row) => row.paidMonth === month);
        if (churchId) rows = rows.filter((row) => row.churchId === churchId);
        if (serviceCode) {
          rows = rows.filter((row) => row.serviceCode === serviceCode);
        }

        rows.sort((first, second) => {
          if (reportType === 'BY_CHURCH') {
            return (
              first.churchName.localeCompare(second.churchName) ||
              first.memberName.localeCompare(second.memberName)
            );
          }
          if (reportType === 'BY_SERVICE') {
            return (
              first.serviceName.localeCompare(second.serviceName) ||
              first.memberName.localeCompare(second.memberName)
            );
          }
          return second.paidAt.localeCompare(first.paidAt);
        });

        return res.json({
          reportType,
          generatedAt: new Date().toISOString(),
          filters: { month, churchId, serviceCode },
          totalMembers: new Set(rows.map((row) => row.userId)).size,
          totalPayments: rows.length,
          totalAmountCents: rows.reduce(
            (total, row) => total + row.amountCents,
            0
          ),
          rows
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.post('/admin/users', requireAdminUser, (req, res) => {
    const roles = Array.isArray(req.body?.roles) && req.body.roles.length
      ? req.body.roles.map(String)
      : ['Member'];
    const result = createUser(roles, req.body);
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(publicUser(result.user));
  });

  router.delete('/admin/users/:userId', requireAdminUser, (req, res) => {
    if (req.params.userId === currentUserId(req)) {
      return res.status(400).json({ message: 'You cannot remove your own admin account.' });
    }
    const removed = removeUser(req.params.userId);
    if (!removed) return res.status(404).json({ message: 'User not found.' });
    return res.status(204).end();
  });

  router.delete(
    '/admin/users/:userId/service-data',
    requireAdminUser,
    async (req, res, next) => {
      try {
        const user = readPlatformState().users.find(
          ({ id }) => String(id) === req.params.userId
        );
        if (!user) {
          return res.status(404).json({ message: 'User not found.' });
        }
        const summary = await resetUserServiceData(
          req.params.userId,
          databaseAvailable
        );
        return res.json(summary);
      } catch (error) {
        return next(error);
      }
    }
  );

  router.put('/admin/users/:userId/roles', requireAdminUser, (req, res) => {
    const roles = Array.isArray(req.body?.roles)
      ? [...new Set(req.body.roles.map((role) => String(role)))]
      : [];
    if (!roles.length) {
      return res.status(400).json({ message: 'Assign at least one role.' });
    }
    const user = updatePlatformState((state) => {
      const found = state.users.find(({ id }) => String(id) === req.params.userId);
      if (found) found.roles = roles;
      return found;
    });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json(publicUser(user));
  });

  router.get('/kzncc-admin/users', requireKznccAdmin, (_req, res) => {
    res.json(
      readPlatformState().users
        .filter(({ roles }) =>
          roles.some((role) => ['KZNCC User', 'KZNCC Admin'].includes(role))
        )
        .map(publicUser)
    );
  });

  router.post('/kzncc-admin/users', requireKznccAdmin, (req, res) => {
    const requestedRole = String(req.body?.role ?? 'KZNCC User');
    if (!['KZNCC User', 'KZNCC Admin'].includes(requestedRole)) {
      return res.status(400).json({ message: 'Choose KZNCC User or KZNCC Admin.' });
    }
    const result = createUser(['Member', requestedRole], req.body);
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(publicUser(result.user));
  });

  router.delete('/kzncc-admin/users/:userId', requireKznccAdmin, (req, res) => {
    if (req.params.userId === currentUserId(req)) {
      return res.status(400).json({ message: 'You cannot remove your own KZNCC Admin account.' });
    }
    const target = readPlatformState().users.find(
      ({ id }) => String(id) === req.params.userId
    );
    if (!target?.roles.some((role) => ['KZNCC User', 'KZNCC Admin'].includes(role))) {
      return res.status(404).json({ message: 'KZNCC user not found.' });
    }
    removeUser(req.params.userId);
    return res.status(204).end();
  });

  router.get('/agreements/me', (req, res) => {
    const agreements = (readPlatformState().legalAcceptances ?? [])
      .filter(({ userId }) => String(userId) === currentUserId(req))
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))
      .map(({ documentSnapshot, ...agreement }) => agreement);
    res.json(agreements);
  });

  router.get('/admin/users/:userId/agreements', requireAdminUser, (req, res) => {
    const agreements = (readPlatformState().legalAcceptances ?? [])
      .filter(({ userId }) => String(userId) === req.params.userId)
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))
      .map(({ documentSnapshot, ...agreement }) => agreement);
    res.json(agreements);
  });

  router.get('/member-documents/me', (req, res) => {
    const documents = (readPlatformState().memberDocuments ?? [])
      .filter(({ memberId }) => String(memberId) === currentUserId(req))
      .sort((first, second) =>
        String(second.uploadedAt).localeCompare(String(first.uploadedAt))
      );
    res.json(documents);
  });

  router.get(
    '/admin/users/:userId/documents',
    requireAdminUser,
    (req, res) => {
      const documents = (readPlatformState().memberDocuments ?? [])
        .filter(
          ({ memberId }) => String(memberId) === req.params.userId
        )
        .sort((first, second) =>
          String(second.uploadedAt).localeCompare(String(first.uploadedAt))
        );
      res.json(documents);
    }
  );

  router.get(
    '/service-provider/documents',
    requireServiceProvider,
    (req, res) => {
      const serviceProviderId = String(req.query.serviceProviderId ?? 'sp-001');
      const documents = (readPlatformState().memberDocuments ?? [])
        .filter((document) => document.serviceProviderId === serviceProviderId)
        .sort((first, second) =>
          String(second.uploadedAt).localeCompare(String(first.uploadedAt))
        );
      res.json(documents);
    }
  );

  router.post(
    '/service-provider/documents',
    requireServiceProvider,
    memberDocumentUpload.single('file'),
    (req, res) => {
      const memberId = String(req.body?.memberId ?? '').trim();
      const serviceId = String(req.body?.serviceId ?? '').trim();
      if (!req.file || !memberId || !serviceId) {
        if (req.file?.path && existsSync(req.file.path)) unlinkSync(req.file.path);
        return res.status(400).json({
          message: 'Choose a member, service and document file.'
        });
      }
      const state = readPlatformState();
      const member = state.users.find(({ id }) => String(id) === memberId);
      const uploader = state.users.find(
        ({ id }) => String(id) === currentUserId(req)
      );
      if (!member) {
        if (existsSync(req.file.path)) unlinkSync(req.file.path);
        return res.status(404).json({ message: 'Member not found.' });
      }
      const document = updatePlatformState((platformState) => {
        platformState.memberDocuments ??= [];
        const created = {
          id: createPlatformId('document'),
          memberId,
          serviceProviderId: String(req.body?.serviceProviderId ?? 'sp-001'),
          serviceId,
          policyNumber: String(
            req.body?.policyNumber ?? `POL-${Date.now()}`
          ),
          documentType: String(
            req.body?.documentType ?? 'FUNERAL_COVER_POLICY'
          ),
          fileName: req.file.originalname,
          fileUrl: `/uploads/member-documents/${req.file.filename}`,
          uploadedAt: new Date().toISOString(),
          uploadedBy: uploader
            ? `${uploader.firstName} ${uploader.lastName}`
            : 'Service Provider',
          status: 'ACTIVE'
        };
        platformState.memberDocuments.unshift(created);
        return created;
      });
      return res.status(201).json(document);
    }
  );

  router.get('/admin/churches', requireAdminUser, (_req, res) => {
    res.json(readPlatformState().churches);
  });

  router.put(
    '/admin/churches/:churchId/branding',
    requireAdminUser,
    (req, res) => {
      const colorPattern = /^#[0-9a-f]{6}$/i;
      const branding = {
        logoUrl: String(req.body?.logoUrl ?? ''),
        primaryColor: String(req.body?.primaryColor ?? ''),
        secondaryColor: String(req.body?.secondaryColor ?? ''),
        accentColor: String(req.body?.accentColor ?? ''),
        backgroundColor: String(req.body?.backgroundColor ?? '')
      };
      if (
        branding.logoUrl.length > 900_000 ||
        !colorPattern.test(branding.primaryColor) ||
        !colorPattern.test(branding.secondaryColor) ||
        !colorPattern.test(branding.accentColor) ||
        !colorPattern.test(branding.backgroundColor)
      ) {
        return res.status(400).json({
          message: 'Choose a valid community logo and colour scheme.'
        });
      }
      const church = updatePlatformState((state) => {
        const selected = state.churches.find(
          ({ id }) => String(id) === req.params.churchId
        );
        if (!selected) return null;
        selected.branding = branding;
        return selected;
      });
      if (!church) {
        return res.status(404).json({ message: 'Community was not found.' });
      }
      return res.json(church);
    }
  );

  router.post(
    '/admin/churches/:churchId/logo',
    requireAdminUser,
    communityLogoUpload.single('logo'),
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({
          message: 'Choose a PNG, JPG or WEBP community logo up to 5 MB.'
        });
      }
      const logoUrl = `/uploads/community-logos/${req.file.filename}`;
      const church = updatePlatformState((state) => {
        const selected = state.churches.find(
          ({ id }) => String(id) === req.params.churchId
        );
        if (!selected) return null;
        selected.branding ??= {
          logoUrl: '',
          primaryColor: '#062d6b',
          secondaryColor: '#087ce8',
          accentColor: '#58c91a',
          backgroundColor: '#f2f8ff'
        };
        selected.branding.logoUrl = logoUrl;
        return selected;
      });
      if (!church) {
        return res.status(404).json({ message: 'Community was not found.' });
      }
      return res.status(201).json(church);
    }
  );

  router.get('/agreements/:agreementId/document', (req, res) => {
    const state = readPlatformState();
    const user = state.users.find(({ id }) => String(id) === currentUserId(req));
    const agreement = (state.legalAcceptances ?? []).find(
      ({ id }) => id === req.params.agreementId
    );
    if (
      !agreement ||
      (String(agreement.userId) !== currentUserId(req) &&
        !user?.roles.includes('Admin User'))
    ) {
      return res.status(404).json({ message: 'Agreement not found.' });
    }
    res
      .status(200)
      .type(agreement.documentMimeType)
      .set(
        'Content-Disposition',
        `inline; filename="${agreement.serviceCode}-terms-${agreement.documentVersion}.html"`
      )
      .send(agreement.documentSnapshot);
  });

  router.get('/agreements/:agreementId/evidence', (req, res) => {
    const state = readPlatformState();
    const user = state.users.find(({ id }) => String(id) === currentUserId(req));
    const agreement = (state.legalAcceptances ?? []).find(
      ({ id }) => id === req.params.agreementId
    );
    if (
      !agreement ||
      (String(agreement.userId) !== currentUserId(req) &&
        !user?.roles.includes('Admin User'))
    ) {
      return res.status(404).json({ message: 'Agreement not found.' });
    }
    res
      .status(200)
      .type('application/json')
      .set(
        'Content-Disposition',
        `attachment; filename="${agreement.serviceCode}-acceptance-${agreement.id}.json"`
      )
      .send(JSON.stringify({
        evidenceType: 'DURANKI_ELECTRONIC_ACCEPTANCE',
        exportedAt: new Date().toISOString(),
        agreement
      }, null, 2));
  });

  router.get('/churches', (_req, res) => {
    res.json(readPlatformState().churches.filter(({ status }) => status === 'ACTIVE'));
  });

  router.get('/churches/:churchId/branches', (req, res) => {
    res.json(
      readPlatformState().branches.filter(
        ({ churchId, status }) =>
          churchId === req.params.churchId && status === 'ACTIVE'
      )
    );
  });

  router.get('/community/me', (req, res) => {
    const membership = readPlatformState().memberCommunities.find(
      ({ memberId }) => String(memberId) === currentUserId(req)
    );
    if (membership?.pendingReselect) {
      return res.json(null);
    }
    res.json(membership ?? null);
  });

  router.get('/community/me/all', (req, res) => {
    const memberships = readPlatformState().memberCommunities.filter(
      ({ memberId, pendingReselect }) =>
        String(memberId) === currentUserId(req) && !pendingReselect
    );
    res.json(memberships);
  });

  router.put('/community/me', (req, res) => {
    const { churchId, branchId } = req.body ?? {};
    const state = readPlatformState();
    const existingMembership = state.memberCommunities.find(
      ({ memberId }) => String(memberId) === currentUserId(req)
    );
    if (existingMembership) {
      const sameSelection =
        existingMembership.churchId === String(churchId) &&
        String(existingMembership.branchId ?? '') === String(branchId ?? '');
      if (sameSelection) {
        return res.json(existingMembership);
      }
      if (!existingMembership.pendingReselect) {
        return res.status(409).json({
          message:
            'Your community is already confirmed. Use Change community once, or request Duranki Admin to change it.'
        });
      }
    }
    const church = state.churches.find(
      (item) => item.id === String(churchId) && item.status === 'ACTIVE'
    );
    const branch = branchId
      ? state.branches.find(
          (item) =>
            item.id === String(branchId) &&
            item.churchId === String(churchId) &&
            item.status === 'ACTIVE'
        )
      : undefined;
    if (!church) return res.status(400).json({ message: 'Choose an active church.' });
    if (branchId && !branch) {
      return res.status(400).json({ message: 'Choose an active branch for this church.' });
    }
    const membership = updatePlatformState((draft) => {
      const existing = draft.memberCommunities.find(
        ({ memberId }) => String(memberId) === currentUserId(req)
      );
      const saved = {
        memberId: currentUserId(req),
        churchId: church.id,
        churchName: church.name,
        branchId: branch?.id,
        branchName: branch?.branchName,
        selfChangeCount: existing?.selfChangeCount ?? 0,
        pendingReselect: false
      };
      if (existing) {
        Object.assign(existing, saved);
      } else {
        draft.memberCommunities.push(saved);
      }
      return saved;
    });
    return res.json(membership);
  });

  router.post('/community/me/add', (req, res) => {
    const { churchId, branchId } = req.body ?? {};
    const providedChurchName = String(req.body?.churchName ?? '').trim();
    const memberId = currentUserId(req);
    const state = readPlatformState();
    const church = state.churches.find(
      (item) => item.id === String(churchId) && item.status === 'ACTIVE'
    ) ?? (
      providedChurchName
        ? {
            id: String(churchId),
            name: providedChurchName,
            status: 'ACTIVE'
          }
        : null
    );
    const branch = branchId
      ? state.branches.find(
          (item) =>
            item.id === String(branchId) &&
            item.churchId === String(churchId) &&
            item.status === 'ACTIVE'
        )
      : undefined;
    if (!church) return res.status(400).json({ message: 'Choose an active community.' });
    if (branchId && !branch) {
      return res.status(400).json({ message: 'Choose an active branch for this community.' });
    }

    const existing = state.memberCommunities.find(
      (membership) =>
        String(membership.memberId) === memberId &&
        membership.churchId === church.id &&
        String(membership.branchId ?? '') === String(branch?.id ?? '') &&
        !membership.pendingReselect
    );
    if (existing) {
      return res.json(existing);
    }

    const membership = updatePlatformState((draft) => {
      const saved = {
        memberId,
        churchId: church.id,
        churchName: church.name,
        branchId: branch?.id,
        branchName: branch?.branchName,
        selfChangeCount: 0,
        pendingReselect: false,
        createdAt: new Date().toISOString()
      };
      draft.memberCommunities.push(saved);
      return saved;
    });

    return res.status(201).json(membership);
  });

  router.post('/community/me/self-change', (req, res) => {
    const memberId = currentUserId(req);
    const state = readPlatformState();
    const membership = state.memberCommunities.find(
      (item) => String(item.memberId) === memberId
    );

    if (!membership || membership.pendingReselect) {
      return res.status(404).json({ message: 'No confirmed community was found.' });
    }

    if ((membership.selfChangeCount ?? 0) >= 1) {
      return res.status(409).json({
        message:
          'You already used your one community change. Please request Duranki Admin approval.'
      });
    }

    updatePlatformState((draft) => {
      const selected = draft.memberCommunities.find(
        (item) => String(item.memberId) === memberId
      );
      if (selected) {
        selected.pendingReselect = true;
        selected.selfChangeCount = (selected.selfChangeCount ?? 0) + 1;
        selected.lastSelfChangeAt = new Date().toISOString();
      }
    });

    return res.json({
      message:
        'Your community choice has been unlocked once. Sign in again and choose the correct community.'
    });
  });

  router.post('/community/me/change-request', (req, res) => {
    const state = readPlatformState();
    const memberId = currentUserId(req);
    const member = state.users.find((user) => String(user.id) === memberId);
    const membership = state.memberCommunities.find(
      (item) => String(item.memberId) === memberId
    );

    const request = updatePlatformState((draft) => {
      const saved = {
        id: createPlatformId('COMMUNITY-CHANGE'),
        memberId,
        memberName: member ? `${member.firstName} ${member.lastName}` : 'Member',
        telephoneNumber: member?.telephoneNumber ?? '',
        currentChurchId: membership?.churchId ?? '',
        currentChurchName: membership?.churchName ?? '',
        currentBranchId: membership?.branchId ?? '',
        currentBranchName: membership?.branchName ?? '',
        status: 'PENDING',
        emailTo: 'admin@duranki.co.za',
        createdAt: new Date().toISOString()
      };
      draft.communityChangeRequests ??= [];
      draft.communityChangeRequests.push(saved);
      return saved;
    });

    return res.status(201).json({
      message:
        'Your community change request was sent to Duranki Admin. They will review it and contact you.',
      requestId: request.id
    });
  });

  router.get('/community/members', (req, res) => {
    const query = String(req.query.query ?? '').trim().toLowerCase();
    const state = readPlatformState();
    const membership = state.memberCommunities.find(
      ({ memberId }) => String(memberId) === currentUserId(req)
    );
    if (!membership || query.length < 2) return res.json([]);
    const communityUserIds = new Set(
      state.memberCommunities
        .filter(({ churchId }) => churchId === membership.churchId)
        .map(({ memberId }) => memberId)
    );
    const normalizedPhoneQuery = cleanPhone(query);
    const results = state.users
      .filter(
        (user) =>
          String(user.id) !== currentUserId(req) &&
          communityUserIds.has(String(user.id)) &&
          (`${user.firstName} ${user.lastName}`.toLowerCase().includes(query) ||
            cleanPhone(user.telephoneNumber).includes(normalizedPhoneQuery))
      )
      .map(publicUser);
    return res.json(results);
  });

  router.get('/community/contacts', (req, res) => {
    const state = readPlatformState();
    const ids = new Set(
      state.contacts
        .filter(({ ownerUserId }) => ownerUserId === currentUserId(req))
        .map(({ contactUserId }) => contactUserId)
    );
    res.json(state.users.filter(({ id }) => ids.has(String(id))).map(publicUser));
  });

  router.post('/community/contacts', (req, res) => {
    const contactUserId = String(req.body?.contactUserId ?? '');
    const state = readPlatformState();
    const contact = state.users.find(({ id }) => String(id) === contactUserId);
    if (!contact || contactUserId === currentUserId(req)) {
      return res.status(400).json({ message: 'Choose another community member.' });
    }
    updatePlatformState((draft) => {
      const exists = draft.contacts.some(
        (item) =>
          item.ownerUserId === currentUserId(req) &&
          item.contactUserId === contactUserId
      );
      if (!exists) {
        draft.contacts.push({
          ownerUserId: currentUserId(req),
          contactUserId,
          createdAt: new Date().toISOString()
        });
      }
    });
    return res.status(201).json(publicUser(contact));
  });

  router.get('/community/conversations/:otherUserId', (req, res) => {
    const key = conversationKey(currentUserId(req), req.params.otherUserId);
    res.json(
      readPlatformState().directMessages
        .filter(({ conversationId }) => conversationId === key)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    );
  });

  router.post('/community/conversations/:otherUserId', (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text || text.length > 1000) {
      return res.status(400).json({ message: 'Enter a message up to 1,000 characters.' });
    }
    const recipient = readPlatformState().users.find(
      ({ id }) => String(id) === req.params.otherUserId
    );
    if (!recipient) return res.status(404).json({ message: 'Member not found.' });
    const message = updatePlatformState((state) => {
      const created = {
        id: createPlatformId('msg'),
        conversationId: conversationKey(currentUserId(req), req.params.otherUserId),
        senderUserId: currentUserId(req),
        recipientUserId: req.params.otherUserId,
        text,
        sentAt: new Date().toISOString()
      };
      state.directMessages.push(created);
      return created;
    });
    return res.status(201).json(message);
  });

  router.get('/wallet', (req, res) => {
    const state = readPlatformState();
    const wallet = state.wallets.find(
      ({ ownerType, ownerId }) =>
        ownerType === 'MEMBER' && ownerId === currentUserId(req)
    );
    if (!wallet) return res.status(404).json({ message: 'Wallet not found.' });
    return res.json({
      ...wallet,
      transactions: state.walletTransactions
        .filter(({ walletId }) => walletId === wallet.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    });
  });

  router.post('/wallet/top-up', (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Enter a valid top-up amount.' });
    }
    const result = updatePlatformState((state) => {
      const wallet = state.wallets.find(
        ({ ownerType, ownerId }) =>
          ownerType === 'MEMBER' && ownerId === currentUserId(req)
      );
      if (!wallet) return null;
      wallet.balance += amount;
      wallet.availableBalance += amount;
      const transaction = {
        id: createPlatformId('tx'),
        walletId: wallet.id,
        transactionType: 'TOP_UP',
        amount,
        direction: 'IN',
        description: 'Cycle card top-up',
        reference: `CYCLE-${Date.now()}`,
        status: 'SUCCESSFUL',
        createdAt: new Date().toISOString()
      };
      state.walletTransactions.push(transaction);
      return { wallet, transaction };
    });
    if (!result) return res.status(404).json({ message: 'Wallet not found.' });
    return res.status(201).json(result);
  });

  router.post('/community-membership/pay-wallet', (req, res) => {
    const amountCents = Number(req.body?.amountCents ?? 2500);
    const planCode = String(req.body?.planCode ?? 'monthly');
    const communityId = String(req.body?.communityId ?? '');
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(400).json({ message: 'Enter a valid membership amount.' });
    }

    const result = updatePlatformState((state) => {
      const wallet = ensureMemberWallet(state, currentUserId(req));
      const amount = amountCents / 100;
      if (wallet.availableBalance < amount) {
        return { error: 'Insufficient wallet balance. Top up your Duranki Wallet or pay by bank card.' };
      }

      wallet.balance -= amount;
      wallet.availableBalance -= amount;
      const reference = `COMMUNITY-MEMBERSHIP-${currentUserId(req)}-${Date.now()}`;
      state.walletTransactions ??= [];
      state.walletTransactions.push({
        id: createPlatformId('tx'),
        walletId: wallet.id,
        transactionType: 'COMMUNITY_MEMBERSHIP_FEE',
        amount,
        direction: 'OUT',
        description: 'Community Membership monthly access fee',
        reference,
        status: 'SUCCESSFUL',
        createdAt: new Date().toISOString()
      });

      state.serviceSubscriptions ??= [];
      const subscription = {
        userId: Number(currentUserId(req)),
        serviceCode: 'community-membership',
        planCode,
        planLabel: 'Community Membership monthly access',
        amountCents,
        status: 'active',
        subscribedAt: new Date().toISOString(),
        communityId,
        paymentMethod: 'WALLET',
        paymentReference: reference
      };
      const index = state.serviceSubscriptions.findIndex(
        (item) =>
          String(item.userId) === currentUserId(req) &&
          item.serviceCode === subscription.serviceCode
      );
      if (index >= 0) {
        state.serviceSubscriptions[index] = subscription;
      } else {
        state.serviceSubscriptions.push(subscription);
      }
      return subscription;
    });

    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json({
      serviceCode: result.serviceCode,
      planCode: result.planCode,
      planLabel: result.planLabel,
      amountCents: result.amountCents,
      status: result.status,
      subscribedAt: result.subscribedAt
    });
  });

  router.post('/wallet/transfer', (req, res) => {
    const amount = Number(req.body?.amount);
    const telephoneNumber = cleanPhone(req.body?.recipientTelephoneNumber);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Enter a valid transfer amount.' });
    }
    const result = updatePlatformState((state) => {
      const recipient = state.users.find(
        (user) => cleanPhone(user.telephoneNumber) === telephoneNumber
      );
      const senderWallet = state.wallets.find(
        ({ ownerType, ownerId }) =>
          ownerType === 'MEMBER' && ownerId === currentUserId(req)
      );
      const recipientWallet = recipient
        ? state.wallets.find(
            ({ ownerType, ownerId }) =>
              ownerType === 'MEMBER' && ownerId === String(recipient.id)
          )
        : undefined;
      if (!recipient || !senderWallet || !recipientWallet) return { error: 'Member wallet not found.' };
      if (recipientWallet.id === senderWallet.id) return { error: 'You cannot transfer to yourself.' };
      if (senderWallet.availableBalance < amount) return { error: 'Insufficient wallet balance.' };
      senderWallet.balance -= amount;
      senderWallet.availableBalance -= amount;
      recipientWallet.balance += amount;
      recipientWallet.availableBalance += amount;
      const reference = `MEMBER-${Date.now()}`;
      state.walletTransactions.push(
        {
          id: createPlatformId('tx'),
          walletId: senderWallet.id,
          transactionType: 'TRANSFER',
          amount,
          direction: 'OUT',
          description: `Transfer to ${recipient.firstName} ${recipient.lastName}`,
          reference,
          status: 'SUCCESSFUL',
          createdAt: new Date().toISOString()
        },
        {
          id: createPlatformId('tx'),
          walletId: recipientWallet.id,
          transactionType: 'TRANSFER',
          amount,
          direction: 'IN',
          description: 'Member wallet transfer',
          reference,
          status: 'SUCCESSFUL',
          createdAt: new Date().toISOString()
        }
      );
      return { reference, recipientName: `${recipient.firstName} ${recipient.lastName}` };
    });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(result);
  });

  router.post('/wallet/cash-out', (req, res) => {
    const amount = Number(req.body?.amount);
    const accountHolder = String(req.body?.accountHolder ?? '').trim();
    const accountNumber = String(req.body?.accountNumber ?? '').replace(/\D/g, '');
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !accountHolder ||
      !/^\d{9,11}$/.test(accountNumber)
    ) {
      return res.status(400).json({ message: 'Enter valid African Bank cash-out details.' });
    }
    const result = updatePlatformState((state) => {
      const wallet = state.wallets.find(
        ({ ownerType, ownerId }) =>
          ownerType === 'MEMBER' && ownerId === currentUserId(req)
      );
      if (!wallet) return { error: 'Wallet not found.' };
      if (wallet.availableBalance < amount) return { error: 'Insufficient wallet balance.' };
      wallet.balance -= amount;
      wallet.availableBalance -= amount;
      const reference = `AB-CASHOUT-${Date.now()}`;
      const transaction = {
        id: createPlatformId('tx'),
        walletId: wallet.id,
        transactionType: 'WALLET_WITHDRAWAL',
        amount,
        direction: 'OUT',
        description: `African Bank cash out to account ending ${accountNumber.slice(-4)}`,
        reference,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };
      state.walletTransactions.push(transaction);
      state.cashOutRequests ??= [];
      state.cashOutRequests.push({
        id: createPlatformId('cashout'),
        userId: currentUserId(req),
        accountHolder,
        accountNumberLast4: accountNumber.slice(-4),
        accountType: req.body?.accountType,
        branchCode: req.body?.branchCode,
        amount,
        reference,
        status: 'PENDING',
        createdAt: transaction.createdAt
      });
      return { reference, transaction };
    });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(result);
  });

  router.get('/referrals', (req, res) => {
    const phone = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    )?.telephoneNumber;
    res.json(
      readPlatformState().referrals.filter(
        ({ referrerPhone, referredPhone }) =>
          cleanPhone(referrerPhone) === cleanPhone(phone) ||
          cleanPhone(referredPhone) === cleanPhone(phone)
      )
    );
  });

  router.post('/referrals', (req, res) => {
    const current = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    const referredPhone = cleanPhone(req.body?.referredPhone);
    const referred = readPlatformState().users.find(
      (user) => cleanPhone(user.telephoneNumber) === referredPhone
    );
    if (!current || !referred) {
      return res.status(400).json({ message: 'The referred member was not found.' });
    }
    const referral = updatePlatformState((state) => {
      const created = {
        id: createPlatformId('ref'),
        referrerName: `${current.firstName} ${current.lastName}`,
        referrerPhone: current.telephoneNumber,
        referredName: `${referred.firstName} ${referred.lastName}`,
        referredPhone: referred.telephoneNumber,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };
      state.referrals.unshift(created);
      return created;
    });
    return res.status(201).json(referral);
  });

  router.patch('/referrals/:id', (req, res) => {
    const status = req.body?.accepted ? 'ACCEPTED' : 'DECLINED';
    const referral = updatePlatformState((state) => {
      const found = state.referrals.find(({ id }) => id === req.params.id);
      if (found) {
        found.status = status;
        found.acknowledgedAt = new Date().toISOString();
      }
      return found;
    });
    if (!referral) return res.status(404).json({ message: 'Referral not found.' });
    return res.json(referral);
  });

  router.get('/marketplace/listings', (_req, res) => {
    res.json(readPlatformState().marketplaceListings);
  });

  router.post('/marketplace/listings', (req, res) => {
    const platformState = readPlatformState();
    const current = platformState.users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    const business = ownedBusiness(
      platformState,
      req,
      req.body?.businessProfileId,
      'BUY_SELL'
    );
    const title = String(req.body?.title ?? '').trim();
    const price = Number(req.body?.price);
    if (!title || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: 'Enter an item title and valid price.' });
    }
    const listing = updatePlatformState((state) => {
      const created = {
        ...req.body,
        id: createPlatformId('listing'),
        title,
        price,
        sellerUserId: currentUserId(req),
        sellerName:
          business?.businessName ??
          (current ? `${current.firstName} ${current.lastName}` : 'Member'),
        businessProfileId: business?.id,
        businessName: business?.businessName,
        status: 'AVAILABLE',
        createdAt: new Date().toISOString()
      };
      state.marketplaceListings.unshift(created);
      return created;
    });
    return res.status(201).json(listing);
  });

  router.patch('/marketplace/listings/:id', (req, res) => {
    const listing = updatePlatformState((state) => {
      const found = state.marketplaceListings.find(({ id }) => id === req.params.id);
      if (found && found.sellerUserId === currentUserId(req)) {
        Object.assign(found, req.body);
      }
      return found;
    });
    if (!listing) return res.status(404).json({ message: 'Listing not found.' });
    return res.json(listing);
  });

  router.post('/marketplace/listings/:id/conversations', (req, res) => {
    const state = readPlatformState();
    const listing = state.marketplaceListings.find(({ id }) => id === req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found.' });

    const buyerUserId = currentUserId(req);
    const sellerUserId = String(listing.sellerUserId);
    if (buyerUserId === sellerUserId) {
      return res.status(400).json({ message: 'You cannot start a seller chat on your own listing.' });
    }

    const conversation = updatePlatformState((platformState) => {
      const existing = platformState.marketplaceConversations.find(
        (item) =>
          item.listingId === listing.id &&
          item.buyerUserId === buyerUserId &&
          item.sellerUserId === sellerUserId &&
          item.status === 'ACTIVE'
      );
      if (existing) return existing;

      const created = {
        id: createPlatformId('marketplace-conversation'),
        listingId: listing.id,
        buyerUserId,
        sellerUserId,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE'
      };
      platformState.marketplaceConversations.unshift(created);
      return created;
    });
    return res.status(201).json(conversation);
  });

  router.get('/marketplace/conversations', (req, res) => {
    const state = readPlatformState();
    const userId = currentUserId(req);
    const usersById = new Map(
      state.users.map((user) => [String(user.id), `${user.firstName} ${user.lastName}`])
    );
    res.json(
      state.marketplaceConversations
        .filter(({ buyerUserId, sellerUserId }) =>
          [buyerUserId, sellerUserId].includes(userId)
        )
        .map((conversation) => {
          const listing = state.marketplaceListings.find(
            ({ id }) => id === conversation.listingId
          );
          return {
            ...conversation,
            listingTitle: listing?.title ?? 'Marketplace item',
            buyerName: usersById.get(conversation.buyerUserId) ?? 'Buyer',
            sellerName: usersById.get(conversation.sellerUserId) ?? listing?.sellerName ?? 'Seller'
          };
        })
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    );
  });

  router.get('/marketplace/conversations/:id', (req, res) => {
    const conversation = readPlatformState().marketplaceConversations.find(
      ({ id }) => id === req.params.id
    );
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
    if (![conversation.buyerUserId, conversation.sellerUserId].includes(currentUserId(req))) {
      return res.status(403).json({ message: 'You do not have access to this conversation.' });
    }
    return res.json(conversation);
  });

  router.get('/marketplace/conversations/:id/messages', (req, res) => {
    const state = readPlatformState();
    const conversation = state.marketplaceConversations.find(({ id }) => id === req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
    if (![conversation.buyerUserId, conversation.sellerUserId].includes(currentUserId(req))) {
      return res.status(403).json({ message: 'You do not have access to this conversation.' });
    }
    return res.json(
      state.marketplaceMessages
        .filter(({ conversationId }) => conversationId === conversation.id)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
    );
  });

  router.post('/marketplace/conversations/:id/messages', (req, res) => {
    const state = readPlatformState();
    const conversation = state.marketplaceConversations.find(({ id }) => id === req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
    const senderUserId = currentUserId(req);
    if (![conversation.buyerUserId, conversation.sellerUserId].includes(senderUserId)) {
      return res.status(403).json({ message: 'You do not have access to this conversation.' });
    }

    const messageType = String(req.body?.messageType ?? 'TEXT');
    const allowedTypes = new Set([
      'TEXT',
      'PAYMENT_REQUEST',
      'PAYMENT_CONFIRMATION',
      'LISTING_STATUS'
    ]);
    const messageText = String(req.body?.messageText ?? '').trim();
    if (!allowedTypes.has(messageType) || !messageText || messageText.length > 2000) {
      return res.status(400).json({ message: 'Enter a valid message up to 2,000 characters.' });
    }

    const message = updatePlatformState((platformState) => {
      const created = {
        id: createPlatformId('marketplace-message'),
        conversationId: conversation.id,
        senderUserId,
        messageType,
        messageText,
        paymentRequestId: req.body?.paymentRequestId
          ? String(req.body.paymentRequestId)
          : undefined,
        createdAt: new Date().toISOString()
      };
      platformState.marketplaceMessages.push(created);
      return created;
    });
    return res.status(201).json(message);
  });

  router.get('/rides/available', (_req, res) => {
    res.json(
      (readPlatformState().availableLifts ?? [])
        .filter((lift) => lift.available && Number(lift.distanceKm) <= 10)
        .sort((first, second) => first.distanceKm - second.distanceKm)
    );
  });

  router.get('/rides/offers/mine', (req, res) => {
    const offer = (readPlatformState().availableLifts ?? []).find(
      ({ driverUserId }) => String(driverUserId) === currentUserId(req)
    );
    return res.json(offer ?? null);
  });

  router.post('/rides/offers', (req, res) => {
    const state = readPlatformState();
    const driver = state.users.find(({ id }) => String(id) === currentUserId(req));
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const vehicle = String(req.body?.vehicle ?? '').trim();
    const registrationNumber = String(req.body?.registrationNumber ?? '').trim();
    const destination = String(req.body?.destination ?? '').trim();
    const departureTime = String(req.body?.departureTime ?? '').trim();
    const seatsAvailable = Math.max(1, Math.min(8, Number(req.body?.seatsAvailable) || 1));
    const business = ownedBusiness(
      state,
      req,
      req.body?.businessProfileId,
      'CATCH_A_RIDE'
    );
    if (
      !driver ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !vehicle ||
      !registrationNumber ||
      !destination ||
      !departureTime
    ) {
      return res.status(400).json({
        message: 'Share your location and complete the vehicle and trip details.'
      });
    }
    const offer = updatePlatformState((platformState) => {
      platformState.availableLifts ??= [];
      const existing = platformState.availableLifts.find(
        ({ driverUserId }) => String(driverUserId) === currentUserId(req)
      );
      const details = {
        driverUserId: currentUserId(req),
        driverName:
          business?.businessName ?? `${driver.firstName} ${driver.lastName}`,
        driverTelephone: business?.telephone ?? driver.telephoneNumber,
        vehicle,
        registrationNumber,
        seatsAvailable,
        rating: existing?.rating ?? 5,
        distanceKm: existing?.distanceKm ?? 2,
        directionDegrees: existing?.directionDegrees ?? 90,
        destination,
        departureTime,
        latitude,
        longitude,
        businessProfileId: business?.id,
        businessName: business?.businessName,
        available: true,
        updatedAt: new Date().toISOString()
      };
      if (existing) {
        Object.assign(existing, details);
        return existing;
      }
      const created = { id: createPlatformId('lift'), ...details };
      platformState.availableLifts.unshift(created);
      return created;
    });
    return res.status(201).json(offer);
  });

  router.patch('/rides/offers/mine', (req, res) => {
    const offer = updatePlatformState((state) => {
      const existing = (state.availableLifts ?? []).find(
        ({ driverUserId }) => String(driverUserId) === currentUserId(req)
      );
      if (!existing) return null;
      existing.available = Boolean(req.body?.available);
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    return offer
      ? res.json(offer)
      : res.status(404).json({ message: 'No lift offer was found.' });
  });

  router.get('/rides/requests', (req, res) => {
    const userId = currentUserId(req);
    const requests = readPlatformState().rideRequests ?? [];
    res.json({
      outgoing: requests
        .filter(({ passengerUserId }) => String(passengerUserId) === userId)
        .sort((first, second) => second.requestedAt.localeCompare(first.requestedAt)),
      incoming: requests
        .filter(({ driverUserId }) => String(driverUserId) === userId)
        .sort((first, second) => second.requestedAt.localeCompare(first.requestedAt))
    });
  });

  router.post('/rides/requests', (req, res) => {
    const state = readPlatformState();
    const lift = (state.availableLifts ?? []).find(
      ({ id, available }) => id === String(req.body?.liftId) && available
    );
    const passenger = state.users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (!lift || !passenger || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        message: 'Choose an available lift and share a valid pickup location.'
      });
    }
    if (String(lift.driverUserId) === currentUserId(req)) {
      return res.status(400).json({ message: 'You cannot request your own lift.' });
    }

    const created = updatePlatformState((platformState) => {
      platformState.rideRequests ??= [];
      const request = {
        id: createPlatformId('ride-request'),
        liftId: lift.id,
        passengerUserId: currentUserId(req),
        passengerName: `${passenger.firstName} ${passenger.lastName}`,
        passengerTelephone: passenger.telephoneNumber,
        driverUserId: lift.driverUserId,
        driverName: lift.driverName,
        vehicle: lift.vehicle,
        pickupLatitude: latitude,
        pickupLongitude: longitude,
        pickupLabel: String(req.body?.pickupLabel ?? 'Shared current location').slice(0, 120),
        requestedAt: new Date().toISOString(),
        status: 'PENDING'
      };
      platformState.rideRequests.unshift(request);
      return request;
    });
    return res.status(201).json(created);
  });

  router.patch('/rides/requests/:requestId', (req, res) => {
    const requestedStatus = String(req.body?.status ?? '');
    if (!['ACCEPTED', 'DECLINED', 'CANCELLED'].includes(requestedStatus)) {
      return res.status(400).json({ message: 'Choose a valid ride request action.' });
    }

    const updated = updatePlatformState((state) => {
      const request = (state.rideRequests ?? []).find(
        ({ id }) => id === req.params.requestId
      );
      if (!request || request.status !== 'PENDING') return null;
      const userId = currentUserId(req);
      const isPassenger = String(request.passengerUserId) === userId;
      const isDriver = String(request.driverUserId) === userId;
      if (
        (requestedStatus === 'CANCELLED' && !isPassenger) ||
        (requestedStatus !== 'CANCELLED' && !isDriver)
      ) {
        return null;
      }
      request.status = requestedStatus;
      request.driverMessage =
        requestedStatus === 'ACCEPTED' ? 'On my way' : undefined;
      request.updatedAt = new Date().toISOString();
      return request;
    });

    return updated
      ? res.json(updated)
      : res.status(403).json({ message: 'This ride request cannot be updated.' });
  });

  router.get('/properties/listings', (_req, res) => {
    res.json(readPlatformState().propertyListings ?? []);
  });

  router.post('/properties/listings', (req, res) => {
    const state = readPlatformState();
    const current = state.users.find(({ id }) => String(id) === currentUserId(req));
    const business = ownedBusiness(
      state,
      req,
      req.body?.businessProfileId,
      'KEYTCHA_PROPERTIES'
    );
    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const listingType = String(req.body?.listingType ?? '');
    const propertyType = String(req.body?.propertyType ?? '');
    const price = Number(req.body?.price);
    const bedrooms = Number(req.body?.bedrooms ?? 0);
    const bathrooms = Number(req.body?.bathrooms ?? 0);
    const parkingSpaces = Number(req.body?.parkingSpaces ?? 0);
    const allowedListingTypes = new Set(['RENT', 'SALE']);
    const allowedPropertyTypes = new Set([
      'HOUSE',
      'APARTMENT',
      'ROOM',
      'TOWNHOUSE',
      'LAND',
      'COMMERCIAL'
    ]);

    if (
      !title ||
      !description ||
      !allowedListingTypes.has(listingType) ||
      !allowedPropertyTypes.has(propertyType) ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return res.status(400).json({
        message: 'Enter the property details, listing type and a valid price.'
      });
    }

    const listing = updatePlatformState((platformState) => {
      const created = {
        ...req.body,
        id: createPlatformId('property'),
        title,
        description,
        listingType,
        propertyType,
        price,
        bedrooms: Number.isFinite(bedrooms) && bedrooms >= 0 ? bedrooms : 0,
        bathrooms: Number.isFinite(bathrooms) && bathrooms >= 0 ? bathrooms : 0,
        parkingSpaces:
          Number.isFinite(parkingSpaces) && parkingSpaces >= 0 ? parkingSpaces : 0,
        ownerUserId: currentUserId(req),
        ownerName:
          business?.businessName ??
          (current ? `${current.firstName} ${current.lastName}` : 'Member'),
        ownerTelephone: business?.telephone ?? current?.telephoneNumber,
        businessProfileId: business?.id,
        businessName: business?.businessName,
        status: 'AVAILABLE',
        createdAt: new Date().toISOString()
      };
      platformState.propertyListings ??= [];
      platformState.propertyListings.unshift(created);
      return created;
    });
    return res.status(201).json(listing);
  });

  router.patch('/properties/listings/:id', (req, res) => {
    const allowedStatuses = new Set([
      'AVAILABLE',
      'UNDER_OFFER',
      'RENTED',
      'SOLD',
      'WITHDRAWN'
    ]);
    const listing = updatePlatformState((state) => {
      const found = (state.propertyListings ?? []).find(
        ({ id }) => id === req.params.id
      );
      if (
        found &&
        found.ownerUserId === currentUserId(req) &&
        allowedStatuses.has(String(req.body?.status))
      ) {
        found.status = String(req.body.status);
      }
      return found;
    });
    if (!listing) return res.status(404).json({ message: 'Property listing not found.' });
    return res.json(listing);
  });

  router.post('/properties/listings/:id/conversations', (req, res) => {
    const state = readPlatformState();
    const listing = (state.propertyListings ?? []).find(
      ({ id }) => id === req.params.id
    );
    if (!listing) return res.status(404).json({ message: 'Property listing not found.' });

    const interestedUserId = currentUserId(req);
    const ownerUserId = String(listing.ownerUserId);
    if (interestedUserId === ownerUserId) {
      return res.status(400).json({
        message: 'You cannot start an enquiry on your own property listing.'
      });
    }

    const conversation = updatePlatformState((platformState) => {
      platformState.propertyConversations ??= [];
      const existing = platformState.propertyConversations.find(
        (item) =>
          item.listingId === listing.id &&
          item.interestedUserId === interestedUserId &&
          item.ownerUserId === ownerUserId &&
          item.status === 'ACTIVE'
      );
      if (existing) return existing;
      const created = {
        id: createPlatformId('property-conversation'),
        listingId: listing.id,
        interestedUserId,
        ownerUserId,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE'
      };
      platformState.propertyConversations.unshift(created);
      return created;
    });
    return res.status(201).json(conversation);
  });

  router.get('/properties/conversations', (req, res) => {
    const state = readPlatformState();
    const userId = currentUserId(req);
    const usersById = new Map(
      state.users.map((user) => [
        String(user.id),
        `${user.firstName} ${user.lastName}`
      ])
    );
    res.json(
      (state.propertyConversations ?? [])
        .filter(({ interestedUserId, ownerUserId }) =>
          [interestedUserId, ownerUserId].includes(userId)
        )
        .map((conversation) => {
          const listing = (state.propertyListings ?? []).find(
            ({ id }) => id === conversation.listingId
          );
          return {
            ...conversation,
            listingTitle: listing?.title ?? 'Property',
            interestedUserName:
              usersById.get(conversation.interestedUserId) ?? 'Interested member',
            ownerName:
              usersById.get(conversation.ownerUserId) ??
              listing?.ownerName ??
              'Property owner'
          };
        })
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    );
  });

  router.get('/properties/conversations/:id/messages', (req, res) => {
    const state = readPlatformState();
    const conversation = (state.propertyConversations ?? []).find(
      ({ id }) => id === req.params.id
    );
    if (!conversation) {
      return res.status(404).json({ message: 'Property conversation not found.' });
    }
    if (
      ![conversation.interestedUserId, conversation.ownerUserId].includes(
        currentUserId(req)
      )
    ) {
      return res.status(403).json({
        message: 'You do not have access to this property conversation.'
      });
    }
    return res.json(
      (state.propertyMessages ?? [])
        .filter(({ conversationId }) => conversationId === conversation.id)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
    );
  });

  router.post('/properties/conversations/:id/messages', (req, res) => {
    const state = readPlatformState();
    const conversation = (state.propertyConversations ?? []).find(
      ({ id }) => id === req.params.id
    );
    if (!conversation) {
      return res.status(404).json({ message: 'Property conversation not found.' });
    }
    const senderUserId = currentUserId(req);
    if (
      ![conversation.interestedUserId, conversation.ownerUserId].includes(
        senderUserId
      )
    ) {
      return res.status(403).json({
        message: 'You do not have access to this property conversation.'
      });
    }
    const messageText = String(req.body?.messageText ?? '').trim();
    if (!messageText || messageText.length > 2000) {
      return res.status(400).json({
        message: 'Enter a valid message up to 2,000 characters.'
      });
    }
    const message = updatePlatformState((platformState) => {
      const created = {
        id: createPlatformId('property-message'),
        conversationId: conversation.id,
        senderUserId,
        messageText,
        createdAt: new Date().toISOString()
      };
      platformState.propertyMessages ??= [];
      platformState.propertyMessages.push(created);
      return created;
    });
    return res.status(201).json(message);
  });

  router.get('/accounting', requireAccountingAdmin, (_req, res) => {
    const state = readPlatformState();
    return res.json({
      employees: state.accountingEmployees ?? [],
      supplierInvoices: state.accountingSupplierInvoices ?? [],
      tenantInvoices: state.accountingTenantInvoices ?? [],
      ledgerEntries: state.accountingLedgerEntries ?? [],
      fundMovements: state.accountingFundMovements ?? [],
      payments: state.accountingPayments ?? [],
      scopeCodes: state.accountingScopeCodes ?? []
    });
  });

  router.get('/accounting/scope-codes', requireAccountingAdmin, (_req, res) => {
    return res.json(readPlatformState().accountingScopeCodes ?? []);
  });

  router.post('/accounting/scope-codes', requireAccountingAdmin, (req, res) => {
    const scopeType = String(req.body?.scopeType ?? '').trim().toUpperCase();
    const scopeId = String(req.body?.scopeId ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    const shortCode = String(req.body?.shortCode ?? '').trim().toUpperCase();
    if (!['TENANT', 'COMMUNITY', 'SERVICE_PROVIDER'].includes(scopeType) || !scopeId || !name || !/^[A-Z0-9-]{3,20}$/.test(shortCode)) {
      return res.status(400).json({ message: 'Enter a valid scope, name and unique short code.' });
    }
    const existing = (readPlatformState().accountingScopeCodes ?? []).find(
      (code) => code.shortCode === shortCode || (code.scopeType === scopeType && code.scopeId === scopeId)
    );
    if (existing) return res.status(409).json({ message: 'This scope or short code already exists.' });
    const created = updatePlatformState((state) => {
      state.accountingScopeCodes ??= [];
      const code = { id: createPlatformId('scope'), scopeType, scopeId, name, shortCode, status: 'ACTIVE', createdAt: new Date().toISOString() };
      state.accountingScopeCodes.push(code);
      return code;
    });
    return res.status(201).json(created);
  });

  router.post('/accounting/employees', requireAccountingAdmin, (req, res) => {
    const fullName = String(req.body?.fullName ?? '').trim();
    const employeeNumber = String(req.body?.employeeNumber ?? '').trim();
    const role = String(req.body?.role ?? '').trim();
    const grossSalary = Number(req.body?.grossSalary ?? 0);
    if (!fullName || !employeeNumber || !role || grossSalary <= 0) {
      return res.status(400).json({ message: 'Complete the employee details and gross salary.' });
    }
    const employee = updatePlatformState((state) => {
      state.accountingEmployees ??= [];
      const created = {
        id: createPlatformId('employee'), fullName, employeeNumber, role,
        entity: String(req.body?.entity ?? 'Duranki Platform'),
        scopeCode: String(req.body?.scopeCode ?? 'DUR'), grossSalary,
        employerUif: Number(req.body?.employerUif ?? 0), sdl: Number(req.body?.sdl ?? 0),
        pension: Number(req.body?.pension ?? 0), medicalAid: Number(req.body?.medicalAid ?? 0),
        status: 'Active', createdAt: new Date().toISOString(), createdBy: currentUserId(req)
      };
      state.accountingEmployees.push(created);
      return created;
    });
    return res.status(201).json(employee);
  });

  router.post('/accounting/employees/bulk', requireAccountingAdmin, (req, res) => {
    const records = Array.isArray(req.body?.employees) ? req.body.employees : [];
    if (!records.length || records.length > 500) {
      return res.status(400).json({ message: 'Upload between 1 and 500 employee records.' });
    }
    const invalid = records.find((record) =>
      !String(record?.fullName ?? '').trim() ||
      !String(record?.employeeNumber ?? '').trim() ||
      !String(record?.role ?? '').trim() ||
      Number(record?.grossSalary ?? 0) <= 0
    );
    if (invalid) return res.status(400).json({ message: 'One or more employee rows are incomplete or invalid.' });
    const duplicates = new Set();
    const duplicate = records.find((record) => {
      const key = `${String(record.scopeCode ?? 'DUR')}:${String(record.employeeNumber).trim().toUpperCase()}`;
      if (duplicates.has(key)) return true;
      duplicates.add(key);
      return false;
    });
    if (duplicate) return res.status(409).json({ message: 'The upload contains duplicate employee numbers in the same scope.' });
    const created = updatePlatformState((state) => {
      state.accountingEmployees ??= [];
      const existing = new Set(state.accountingEmployees.map((employee) => `${employee.scopeCode}:${String(employee.employeeNumber).toUpperCase()}`));
      const rows = records.filter((record) => !existing.has(`${String(record.scopeCode ?? 'DUR')}:${String(record.employeeNumber).trim().toUpperCase()}`)).map((record) => ({
        id: createPlatformId('employee'), fullName: String(record.fullName).trim(),
        employeeNumber: String(record.employeeNumber).trim(), role: String(record.role).trim(),
        entity: String(record.entity ?? 'Duranki Platform'), scopeCode: String(record.scopeCode ?? 'DUR'),
        grossSalary: Number(record.grossSalary), employerUif: Number(record.employerUif ?? 0),
        sdl: Number(record.sdl ?? 0), pension: Number(record.pension ?? 0),
        medicalAid: Number(record.medicalAid ?? 0), status: 'Active',
        createdAt: new Date().toISOString(), createdBy: currentUserId(req)
      }));
      state.accountingEmployees.push(...rows);
      return rows;
    });
    return res.status(201).json({ created, createdCount: created.length, skippedCount: records.length - created.length });
  });

  router.post('/accounting/payments', requireAccountingAdmin, (req, res) => {
    const destinationScopeCode = String(req.body?.destinationScopeCode ?? '').trim().toUpperCase();
    const amount = Number(req.body?.amount ?? 0);
    const paymentReference = String(req.body?.paymentReference ?? '').trim();
    const purpose = String(req.body?.purpose ?? '').trim();
    const paymentDate = String(req.body?.paymentDate ?? '').trim();
    const state = readPlatformState();
    const destination = (state.accountingScopeCodes ?? []).find(({ shortCode, status }) => shortCode === destinationScopeCode && status === 'ACTIVE');
    if (!destination || amount <= 0 || !paymentReference || !purpose || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      return res.status(400).json({ message: 'Choose a valid destination and enter the amount, date, purpose and payment reference.' });
    }
    if ((state.accountingPayments ?? []).some(({ paymentReference: reference }) => reference === paymentReference)) {
      return res.status(409).json({ message: 'This payment reference has already been recorded.' });
    }
    const payment = updatePlatformState((draft) => {
      draft.accountingPayments ??= [];
      draft.accountingFundMovements ??= [];
      draft.accountingLedgerEntries ??= [];
      const created = {
        id: createPlatformId('payment'), paymentDate, sourceScopeCode: String(req.body?.sourceScopeCode ?? 'DUR'),
        sourceName: String(req.body?.sourceName ?? 'Duranki Platform'), destinationScopeCode,
        destinationName: destination.name, destinationType: destination.scopeType,
        amount, currency: 'ZAR', purpose, paymentReference,
        paymentMethod: String(req.body?.paymentMethod ?? 'Bank transfer'), status: 'Recorded',
        createdAt: new Date().toISOString(), createdBy: currentUserId(req)
      };
      draft.accountingPayments.unshift(created);
      const movementId = createPlatformId('fund');
      draft.accountingFundMovements.unshift({
        id: movementId, date: paymentDate, reference: paymentReference,
        source: created.sourceName, destination: destination.name, category: purpose,
        amount, bankReference: paymentReference, scopeCode: destinationScopeCode,
        status: 'Reconciled', sourceDocumentId: created.id, sourceDocumentType: 'PAYMENT',
        createdAt: new Date().toISOString(), reconciledAt: new Date().toISOString(), reconciledBy: currentUserId(req)
      });
      draft.accountingLedgerEntries.unshift(
        { id: createPlatformId('ledger'), date: paymentDate, reference: paymentReference, entity: created.sourceName, scopeCode: created.sourceScopeCode, account: 'Settlement expense', type: 'Expense', description: purpose, debit: amount, credit: 0, status: 'Posted', sourceDocumentId: created.id, createdAt: new Date().toISOString(), createdBy: currentUserId(req) },
        { id: createPlatformId('ledger'), date: paymentDate, reference: paymentReference, entity: created.sourceName, scopeCode: created.sourceScopeCode, account: 'Bank', type: 'Asset', description: `Payment to ${destination.name}`, debit: 0, credit: amount, status: 'Posted', sourceDocumentId: created.id, createdAt: new Date().toISOString(), createdBy: currentUserId(req) }
      );
      return created;
    });
    return res.status(201).json(payment);
  });

  router.post('/accounting/supplier-invoices', requireAccountingAdmin, accountingInvoiceUpload.single('invoice'), (req, res) => {
    const supplier = String(req.body?.supplier ?? '').trim();
    const invoiceNumber = String(req.body?.invoiceNumber ?? '').trim();
    const amount = Number(req.body?.amount ?? 0);
    if (!supplier || !invoiceNumber || amount <= 0 || !req.file) {
      if (req.file?.path && existsSync(req.file.path)) unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Enter invoice details and attach a PDF or image.' });
    }
    const invoice = updatePlatformState((state) => {
      state.accountingSupplierInvoices ??= [];
      state.accountingFundMovements ??= [];
      const created = {
        id: createPlatformId('supplier-invoice'), supplier,
        entity: String(req.body?.entity ?? 'Duranki Platform'),
        scopeCode: String(req.body?.scopeCode ?? 'DUR'), invoiceNumber,
        invoiceDate: String(req.body?.invoiceDate ?? ''), dueDate: String(req.body?.dueDate ?? ''),
        amount, fileName: req.file.originalname,
        fileUrl: `/uploads/accounting-invoices/${req.file.filename}`,
        status: 'Uploaded', createdAt: new Date().toISOString(), createdBy: currentUserId(req)
      };
      state.accountingSupplierInvoices.push(created);
      state.accountingFundMovements.unshift({
        id: createPlatformId('fund'), date: created.invoiceDate, reference: invoiceNumber,
        source: created.entity, destination: supplier, category: 'Supplier invoice pending payment',
        amount, bankReference: '', scopeCode: created.scopeCode, status: 'Unmatched',
        sourceDocumentId: created.id, createdAt: new Date().toISOString()
      });
      return created;
    });
    return res.status(201).json(invoice);
  });

  router.post('/accounting/tenant-invoices', requireAccountingAdmin, (req, res) => {
    const tenant = String(req.body?.tenant ?? '').trim();
    const subscriptionFee = Number(req.body?.subscriptionFee ?? 0);
    const serviceFees = Number(req.body?.serviceFees ?? 0);
    const vatRate = Number(req.body?.vatRate ?? 15);
    if (!tenant || subscriptionFee + serviceFees <= 0 || vatRate < 0) {
      return res.status(400).json({ message: 'Choose a tenant and enter valid billing amounts.' });
    }
    const invoice = updatePlatformState((state) => {
      state.accountingTenantInvoices ??= [];
      const scopeCode = String(req.body?.scopeCode ?? 'TEN-UNK');
      const net = subscriptionFee + serviceFees;
      const vat = Number((net * vatRate / 100).toFixed(2));
      const sequence = state.accountingTenantInvoices.length + 1;
      const invoiceNumber = `DUR-${scopeCode}-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;
      const created = {
        id: createPlatformId('tenant-invoice'), tenant, scopeCode, invoiceNumber,
        period: String(req.body?.period ?? ''), issueDate: String(req.body?.issueDate ?? ''),
        dueDate: String(req.body?.dueDate ?? ''), subscriptionFee, serviceFees, vatRate, vat,
        total: net + vat, status: 'Issued', createdAt: new Date().toISOString(), createdBy: currentUserId(req)
      };
      state.accountingTenantInvoices.push(created);
      return created;
    });
    return res.status(201).json(invoice);
  });

  router.post('/accounting/ledger-entries', requireAccountingAdmin, (req, res) => {
    const reference = String(req.body?.reference ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const debit = Number(req.body?.debit ?? 0);
    const credit = Number(req.body?.credit ?? 0);
    if (!reference || !description || (debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
      return res.status(400).json({ message: 'Enter either a debit or a credit with a reference and description.' });
    }
    const entry = updatePlatformState((state) => {
      state.accountingLedgerEntries ??= [];
      const created = {
        id: createPlatformId('ledger'), date: String(req.body?.date ?? ''), reference,
        entity: String(req.body?.entity ?? 'Duranki Platform'), scopeCode: String(req.body?.scopeCode ?? 'DUR'),
        account: String(req.body?.account ?? ''), type: String(req.body?.type ?? 'Expense'), description,
        debit, credit, status: 'Posted', createdAt: new Date().toISOString(), createdBy: currentUserId(req)
      };
      state.accountingLedgerEntries.unshift(created);
      return created;
    });
    return res.status(201).json(entry);
  });

  router.patch('/accounting/fund-movements/:movementId/reconcile', requireAccountingAdmin, (req, res) => {
    const bankReference = String(req.body?.bankReference ?? '').trim();
    if (!bankReference) return res.status(400).json({ message: 'Enter the bank reference before reconciling.' });
    const movement = updatePlatformState((state) => {
      const found = (state.accountingFundMovements ?? []).find(({ id }) => id === req.params.movementId);
      if (found) Object.assign(found, { bankReference, status: 'Reconciled', reconciledAt: new Date().toISOString(), reconciledBy: currentUserId(req) });
      return found;
    });
    if (!movement) return res.status(404).json({ message: 'Fund movement not found.' });
    return res.json(movement);
  });

  router.get('/jobs', (_req, res) => {
    res.json(readPlatformState().jobListings);
  });

  router.post('/jobs', (req, res) => {
    const platformState = readPlatformState();
    const current = platformState.users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    const business = ownedBusiness(
      platformState,
      req,
      req.body?.businessProfileId,
      'JOB_SEARCH'
    );
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ message: 'Enter a job title.' });
    const job = updatePlatformState((state) => {
      const created = {
        ...req.body,
        id: createPlatformId('job'),
        title,
        listedByUserId: currentUserId(req),
        listedByUserName:
          business?.businessName ??
          (current ? `${current.firstName} ${current.lastName}` : 'Member'),
        businessProfileId: business?.id,
        businessName: business?.businessName,
        status: 'OPEN',
        createdAt: new Date().toISOString()
      };
      state.jobListings.unshift(created);
      return created;
    });
    return res.status(201).json(job);
  });

  router.patch('/jobs/:id', (req, res) => {
    const job = updatePlatformState((state) => {
      const found = state.jobListings.find(({ id }) => id === req.params.id);
      if (found && found.listedByUserId === currentUserId(req)) {
        Object.assign(found, req.body);
      }
      return found;
    });
    if (!job) return res.status(404).json({ message: 'Job listing not found.' });
    return res.json(job);
  });

  return router;
}
