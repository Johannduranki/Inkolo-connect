import express from 'express';
import { listingChanges, listingCreation, ownedListing } from './listing-security.js';
import { acknowledgeReferral } from './referral-security.js';
import { moneyCents, transferBalances } from './wallet-security.js';
import { validateGlobalRoleChange } from './role-security.js';
import { validateUploadedFiles } from './upload-security.js';
import { platformAdmin } from './tenant-access.js';
import { canAccessProviderDocument, providerUploadScope, providerWorkspace, saveProviderGrant } from './provider-security.js';
import multer from 'multer';
import path from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createPlatformId, readPlatformState as defaultReadState, updatePlatformState as defaultUpdateState } from './platform-store.js';
import { resetUserServiceData } from './user-reset.js';
import { getPool } from './database.js';
import { editAdminProfile, profileVersion } from './admin-profile.js';
import { userContributions } from './user-contributions.js';
import { selectMemberCommunity } from './community-selection.js';
import { resolveCommunityConfiguration } from '../../frontend/public/tenant-service-policy.js';
import {communityPeerIds,requireCommunityPeer,participantMessage} from './community-messaging-security.js';
import {conversationListing,writableConversation} from './conversation-security.js';
import {activeRideUser,rideLocation,rideOfferInput,visibleRideOffers,requestableLift,rideRequestView,visibleRideRequests} from './ride-security.js';
import { createAccountingRouter } from './accounting-api.js';

const cleanPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('27') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
};

const currentUserId = (req) => String(req.auth.sub);
const requireCurrentAdmin = (state, actorId) => {
  const actor = state.users.find(user => String(user.id) === String(actorId));
  if (!platformAdmin(actor)) throw Object.assign(Error('Platform administrator access is required.'), { status: 403 });
  return actor;
};
const agreementFor = (state, agreementId, actorId) => {
  const actor = state.users.find(user => String(user.id) === String(actorId));
  if (actor?.status !== 'active') return undefined;
  return (state.legalAcceptances || []).find(agreement => agreement.id === agreementId &&
    (String(agreement.userId) === String(actorId) || platformAdmin(actor)));
};
const downloadPart = value => String(value ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'record';
const conversationKey = (first, second) => [String(first), String(second)].sort().join(':');
const reportServiceNames = {
  'build-up-balance': 'Buy and Sell',
  funeral: 'Funeral Services',
  community: 'My Community',
  referral: 'Referral',
  'job-search': 'Job Search',
  'vas-services': 'VAS Services',
  eduu: 'EduU',
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

export function createPlatformRouter({ requireAuth, databaseAvailable = false, additionalSubscriptions = () => [], readPlatformState = defaultReadState, updatePlatformState = defaultUpdateState }) {
  const router = express.Router();
  router.use(requireAuth);
  router.use('/accounting', createAccountingRouter({ databaseAvailable,readState:readPlatformState,updateState:updatePlatformState }));
  const requireAdminUser = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
      if (!platformAdmin(user)) {
      return res.status(403).json({ message: 'Duranki Admin access is required.' });
    }
    return next();
  };
  const requireKznccAdmin = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (!platformAdmin(user)) {
      return res.status(403).json({ message: 'Global account administration requires Platform Admin. Use tenant staff administration for scoped access.' });
    }
    return next();
  };
  const requireServiceProvider = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (
      !platformAdmin(user) && !user?.roles.some((role) =>
        ['Service Provider Admin', 'Service Provider User'].includes(role)
      )
    ) {
      return res.status(403).json({
        message: 'Service Provider access is required.'
      });
    }
    return next();
  };
  const createUser = async (roles, body, actorId) => {
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
      user: await updatePlatformState((state) => {
        const actor = requireCurrentAdmin(state, actorId);
        const currentRoles = validateGlobalRoleChange(actor, null, roles);
        if(state.users.some(user=>cleanPhone(user.telephoneNumber)===telephoneNumber))throw Object.assign(Error('A user with this telephone number already exists.'),{status:409});
        const id = Math.max(0, ...state.users.map((user) => Number(user.id))) + 1;
        const created = {
          id,
          firstName,
          lastName,
          telephoneNumber,
          email,
          roles: currentRoles,
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
        (state.securityAudit ??= []).push({ action: 'user.created', actorId: String(actorId), targetId: String(id), roles: [...currentRoles], at: new Date().toISOString() });
        return created;
      })
    };
  };
  const removeUser = async (userId, actorId, kznccOnly = false) =>
    await updatePlatformState((state) => {
      requireCurrentAdmin(state, actorId);
      if (String(userId) === String(actorId)) throw Object.assign(Error('You cannot remove your own admin account.'), { status: 400 });
      const index = state.users.findIndex(({ id }) => String(id) === String(userId));
      if (index < 0) return null;
      if (kznccOnly && !state.users[index].roles?.some(role => ['KZNCC User', 'KZNCC Admin'].includes(role))) return null;
      const [removed] = state.users.splice(index, 1);
      state.profiles = state.profiles.filter(
        ({ userId: profileUserId }) => String(profileUserId) !== String(userId)
      );
      state.contacts = state.contacts.filter(
        ({ ownerUserId, contactUserId }) =>
          String(ownerUserId) !== String(userId) &&
          String(contactUserId) !== String(userId)
      );
      (state.securityAudit ??= []).push({ action: 'user.removed', actorId: String(actorId), targetId: String(userId), at: new Date().toISOString() });
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

  router.get('/businesses/mine', (req, res) => {
    res.json(
      (readPlatformState().businessProfiles ?? [])
        .filter(({ ownerUserId }) => ownerUserId === currentUserId(req))
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    );
  });

  router.post('/businesses', async (req, res) => {
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
    const business = await updatePlatformState((state) => {
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

  router.post('/businesses/:businessId/bulk', async (req, res) => {
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

    const createdRecords = await updatePlatformState((platformState) => {
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

  router.get('/profile', (req, res) => {
    const profile = readPlatformState().profiles.find(
      ({ userId }) => String(userId) === currentUserId(req)
    );
    res.json(profile ?? null);
  });

  router.put('/profile', async (req, res) => {
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
    const profile = await updatePlatformState((state) => {
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
    const state=readPlatformState();
    res.json(state.users.map(user=>({...publicUser(user),status:user.status,importReview:user.importReview||[],communities:state.memberCommunities.filter(m=>String(m.memberId)===String(user.id)).map(m=>({id:m.communityId||m.churchId,name:m.communityName||m.churchName,tenantId:m.tenantId}))})));
  });
  router.get('/admin/import-directory',requireAdminUser,(req,res)=>{
    const state=readPlatformState();
    res.json({imported:!!state.coreImport,users:state.users.length,communities:(state.importedCommunities||[]).map(c=>({...c,users:state.memberCommunities.filter(m=>m.communityId===c.id).length}))});
  });

  router.get('/admin/users/:userId/profile', requireAdminUser, async (req, res) => {
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
      status:user.status,
      importReview:user.importReview||[],
      sourceUserId:user.sourceUserId||null,
      updatedAt:user.updatedAt||null,
      version:profileVersion(user,profile),
      communities:(state.memberCommunities||[]).filter(m=>String(m.memberId)===req.params.userId),
      ...userContributions([...(state.serviceSubscriptions||[]),...await additionalSubscriptions(user.id)],user.id,reportServiceNames),
      profile: profile ?? null,
      community: community ?? null
    });
  });

  router.put('/admin/users/:userId/profile',requireAdminUser,async (req,res,next)=>{
    if(databaseAvailable)return res.status(503).json({message:'Profile editing for SQL-backed accounts is not configured.'});
    try{
      const result=await updatePlatformState(state=>editAdminProfile(state,req.params.userId,req.body||{},currentUserId(req)));
      return res.json(result);
    }catch(error){if(error.status)return res.status(error.status).json({message:error.message});return next(error);}
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

  router.post('/admin/users', requireAdminUser, async (req, res) => {
    let roles;
    try { roles = validateGlobalRoleChange(readPlatformState().users.find(u => String(u.id) === currentUserId(req)), null, req.body?.roles ?? ['Member']); }
    catch (error) { return res.status(error.status).json({ message: error.message }); }
    const result = await createUser(roles, req.body, currentUserId(req));
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(publicUser(result.user));
  });

  router.delete('/admin/users/:userId', requireAdminUser, async (req, res) => {
    if (req.params.userId === currentUserId(req)) {
      return res.status(400).json({ message: 'You cannot remove your own admin account.' });
    }
    const removed = await removeUser(req.params.userId, currentUserId(req));
    if (!removed) return res.status(404).json({ message: 'User not found.' });
    await req.app.locals.sessions?.revokeUser(removed.id);
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
          databaseAvailable,
          {actorId:currentUserId(req),mode:'admin',readState:readPlatformState,updateState:updatePlatformState}
        );
        return res.json(summary);
      } catch (error) {
        return next(error);
      }
    }
  );

  router.put('/admin/users/:userId/roles', requireAdminUser, async (req, res) => {
    let roles;
    try { roles = validateGlobalRoleChange(readPlatformState().users.find(u => String(u.id) === currentUserId(req)), req.params.userId, req.body?.roles); }
    catch (error) { return res.status(error.status).json({ message: error.message }); }
    const user = await updatePlatformState((state) => {
      roles=validateGlobalRoleChange(state.users.find(u=>String(u.id)===currentUserId(req)),req.params.userId,req.body?.roles);
      const found = state.users.find(({ id }) => String(id) === req.params.userId);
      if (found) {
        state.securityAudit ??= [];
        state.securityAudit.push({ action: 'user.roles.changed', actorId: currentUserId(req), targetId: String(found.id), before: found.roles, after: roles, at: new Date().toISOString() });
        found.roles = roles;
      }
      return found;
    });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    await req.app.locals.sessions?.revokeUser(user.id);
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

  router.post('/kzncc-admin/users', requireKznccAdmin, async (req, res) => {
    const requestedRole = String(req.body?.role ?? 'KZNCC User');
    if (!['KZNCC User', 'KZNCC Admin'].includes(requestedRole)) {
      return res.status(400).json({ message: 'Choose KZNCC User or KZNCC Admin.' });
    }
    const result = await createUser(['Member', requestedRole], req.body, currentUserId(req));
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(publicUser(result.user));
  });

  router.delete('/kzncc-admin/users/:userId', requireKznccAdmin, async (req, res) => {
    if (req.params.userId === currentUserId(req)) {
      return res.status(400).json({ message: 'You cannot remove your own KZNCC Admin account.' });
    }
    const target = readPlatformState().users.find(
      ({ id }) => String(id) === req.params.userId
    );
    if (!target?.roles.some((role) => ['KZNCC User', 'KZNCC Admin'].includes(role))) {
      return res.status(404).json({ message: 'KZNCC user not found.' });
    }
    const removed = await removeUser(req.params.userId, currentUserId(req), true);
    if (!removed) return res.status(404).json({ message: 'KZNCC user not found.' });
    await req.app.locals.sessions?.revokeUser(removed.id);
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
      const state = readPlatformState();
      const actor = state.users.find(user => String(user.id) === currentUserId(req));
      const documents = (state.memberDocuments ?? [])
        .filter((document) => document.serviceProviderId === serviceProviderId && canAccessProviderDocument(state, actor, document))
        .sort((first, second) =>
          String(second.uploadedAt).localeCompare(String(first.uploadedAt))
        );
      res.json(documents);
    }
  );

  router.get('/service-provider/workspace', requireServiceProvider, (req, res) => {
    const state = readPlatformState();
    const actor = state.users.find(user => String(user.id) === currentUserId(req));
    res.set('Cache-Control', 'no-store').json(providerWorkspace(state, actor));
  });

  router.post(
    '/service-provider/documents',
    requireServiceProvider,
    memberDocumentUpload.single('file'),
    validateUploadedFiles,
    async (req, res) => {
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
      let documentScope;
      try { documentScope = providerUploadScope(state, uploader, req.body); }
      catch (error) {
        if (existsSync(req.file.path)) unlinkSync(req.file.path);
        return res.status(error.status || 400).json({ message: error.message });
      }
      if (!member) {
        if (existsSync(req.file.path)) unlinkSync(req.file.path);
        return res.status(404).json({ message: 'Member not found.' });
      }
      const document = await updatePlatformState((platformState) => {
        // Uploads may wait for the storage queue; authorize against its current snapshot.
        try { documentScope = providerUploadScope(platformState, uploader, req.body); }
        catch (error) {
          if (existsSync(req.file.path)) unlinkSync(req.file.path);
          throw error;
        }
        platformState.memberDocuments ??= [];
        const created = {
          id: createPlatformId('document'),
          memberId,
          ...documentScope,
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
  router.get('/admin/provider-grants', requireAdminUser, (_req, res) => res.json(readPlatformState().providerAccessGrants || []));
  router.post('/admin/provider-grants', requireAdminUser, async (req, res, next) => {
    try {
      const actor = readPlatformState().users.find(user => String(user.id) === currentUserId(req));
      const grant = await updatePlatformState(state => saveProviderGrant(state, actor, req.body));
      return res.json(grant);
    } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); return next(error); }
  });

  router.put(
    '/admin/churches/:churchId/branding',
    requireAdminUser,
    async (req, res) => {
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
      const church = await updatePlatformState((state) => {
        requireCurrentAdmin(state, currentUserId(req));
        const selected = state.churches.find(
          ({ id }) => String(id) === req.params.churchId
        );
        if (!selected) return null;
        selected.branding = branding;
        (state.securityAudit ??= []).push({ action: 'community.branding.changed', actorId: currentUserId(req), targetId: String(selected.id), at: new Date().toISOString() });
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
    validateUploadedFiles,
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({
          message: 'Choose a PNG, JPG or WEBP community logo up to 5 MB.'
        });
      }
      const logoUrl = `/uploads/community-logos/${req.file.filename}`;
      const church = await updatePlatformState((state) => {
        requireCurrentAdmin(state, currentUserId(req));
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
        (state.securityAudit ??= []).push({ action: 'community.logo.changed', actorId: currentUserId(req), targetId: String(selected.id), at: new Date().toISOString() });
        return selected;
      });
      if (!church) {
        return res.status(404).json({ message: 'Community was not found.' });
      }
      return res.status(201).json(church);
    }
  );

  router.get('/agreements/:agreementId/document', (req, res) => {
    const agreement = agreementFor(readPlatformState(), req.params.agreementId, currentUserId(req));
    if (!agreement) {
      return res.status(404).json({ message: 'Agreement not found.' });
    }
    res
      .status(200)
      .type('text/html')
      .set({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
      })
      .set(
        'Content-Disposition',
        `inline; filename="${downloadPart(agreement.serviceCode)}-terms-${downloadPart(agreement.documentVersion)}.html"`
      )
      .send(agreement.documentSnapshot);
  });

  router.get('/agreements/:agreementId/evidence', (req, res) => {
    const agreement = agreementFor(readPlatformState(), req.params.agreementId, currentUserId(req));
    if (!agreement) {
      return res.status(404).json({ message: 'Agreement not found.' });
    }
    res
      .status(200)
      .type('application/json')
      .set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'" })
      .set(
        'Content-Disposition',
        `attachment; filename="${downloadPart(agreement.serviceCode)}-acceptance-${downloadPart(agreement.id)}.json"`
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

  router.get('/community/me/all',(req,res)=>res.json(readPlatformState().memberCommunities.filter(m=>String(m.memberId)===currentUserId(req))));
  router.get('/community/me', (req, res) => {
    const communityId = req.query.communityId;
    if (communityId !== undefined && (typeof communityId !== 'string' || !communityId.trim())) {
      return res.status(400).json({ message: 'Invalid community selection.' });
    }
    const membership = selectMemberCommunity(
      readPlatformState().memberCommunities, currentUserId(req), communityId
    );
    if (communityId && !membership) {
      return res.status(403).json({ message: 'You are not registered in the selected community.' });
    }
    const policy = readPlatformState().cycleServiceAvailability;
    const configuration = membership ? resolveCommunityConfiguration(membership, policy?.communities, policy?.tenants) : null;
    res.json(membership ? { ...membership, serviceConfiguration: configuration ? {
      id: configuration.id, tenantId: configuration.tenantId,
      serviceCodes: configuration.serviceCodes
    } : null } : null);
  });

  router.put('/community/me', async (req, res) => {
    const { churchId, branchId } = req.body ?? {};
    const state = readPlatformState();
    const existingMembership = state.memberCommunities.find(
      ({ memberId }) => memberId === currentUserId(req)
    );
    if (existingMembership) {
      const sameSelection =
        existingMembership.churchId === String(churchId) &&
        String(existingMembership.branchId ?? '') === String(branchId ?? '');
      if (sameSelection) {
        return res.json(existingMembership);
      }
      return res.status(409).json({
        message:
          'Your community is already confirmed. Email Duranki Admin to request a church or branch change.'
      });
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
    const membership = await updatePlatformState((draft) => {
      const saved = {
        memberId: currentUserId(req),
        churchId: church.id,
        churchName: church.name,
        branchId: branch?.id,
        branchName: branch?.branchName
      };
      draft.memberCommunities.push(saved);
      return saved;
    });
    return res.json(membership);
  });

  router.get('/community/members', (req, res) => {
    const query = String(req.query.query ?? '').trim().toLowerCase();
    const state = readPlatformState();
    const communityUserIds = communityPeerIds(state,currentUserId(req),req.query.communityId);
    if (query.length < 2 || query.length > 100) return res.json([]);
    const normalizedPhoneQuery = cleanPhone(query);
    const results = state.users
      .filter(
        (user) =>
          String(user.id) !== currentUserId(req) &&
          communityUserIds.has(String(user.id)) &&
          (`${user.firstName} ${user.lastName}`.toLowerCase().includes(query) ||
            (normalizedPhoneQuery.length>=2&&cleanPhone(user.telephoneNumber).includes(normalizedPhoneQuery)))
      )
      .slice(0,50)
      .map(publicUser);
    return res.json(results);
  });

  router.get('/community/contacts', (req, res) => {
    const state = readPlatformState();
    const peers = communityPeerIds(state,currentUserId(req),req.query.communityId);
    const ids = new Set(
      state.contacts
        .filter(({ ownerUserId }) => ownerUserId === currentUserId(req))
        .map(({ contactUserId }) => contactUserId)
    );
    res.json(state.users.filter(({ id }) => ids.has(String(id))&&peers.has(String(id))).map(publicUser));
  });

  router.post('/community/contacts', async (req, res) => {
    const contactUserId = String(req.body?.contactUserId ?? '');
    const contact = await updatePlatformState((draft) => {
      const peer = requireCommunityPeer(draft,currentUserId(req),contactUserId,req.body?.communityId);
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
      return publicUser(peer);
    });
    return res.status(201).json(contact);
  });

  router.get('/community/conversations/:otherUserId', (req, res) => {
    const state=readPlatformState();
    requireCommunityPeer(state,currentUserId(req),req.params.otherUserId,req.query.communityId);
    const key = conversationKey(currentUserId(req), req.params.otherUserId);
    res.json(
      state.directMessages
        .filter(message => message.conversationId === key&&participantMessage(message,currentUserId(req),req.params.otherUserId))
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    );
  });

  router.post('/community/conversations/:otherUserId', async (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text || text.length > 1000) {
      return res.status(400).json({ message: 'Enter a message up to 1,000 characters.' });
    }
    const message = await updatePlatformState((state) => {
      requireCommunityPeer(state,currentUserId(req),req.params.otherUserId,req.body?.communityId);
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
    return res.status(409).json({message:'Start a secure Cycle Pay top-up in My payments. Wallet credits require a verified provider notification.',checkoutUrl:'/payments/cycle?purpose=wallet-top-up'});
  });

  router.post('/wallet/transfer', async (req, res) => {
    if(readPlatformState().cycleWalletReview?.[currentUserId(req)])return res.status(409).json({message:'Wallet payments are on hold pending review of a Cycle refund or dispute.'});
    const amount = req.body?.amount;
    const telephoneNumber = cleanPhone(req.body?.recipientTelephoneNumber);
    const requestKey=req.get('Idempotency-Key')||req.body?.idempotencyKey;
    if(typeof requestKey!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey))return res.status(400).json({message:'Refresh the page before submitting a transfer. A payment request key is required.'});
    if (moneyCents(amount) === null || amount <= 0) {
      return res.status(400).json({ message: 'Enter a valid transfer amount.' });
    }
    const result = await updatePlatformState((state) => {
      if(state.cycleWalletReview?.[currentUserId(req)])return {error:'Wallet payments are on hold pending review.'};
      const prior=(state.walletTransferRequests||[]).find(r=>r.userId===currentUserId(req)&&r.key===requestKey);
      if(prior){
        if(prior.recipientTelephoneNumber!==telephoneNumber||prior.amountCents!==moneyCents(amount))throw Object.assign(Error('This payment request key was already used for different transfer details.'),{status:409});
        return {...prior.result,replayed:true};
      }
      const recipients = state.users.filter(
        user => user.status === 'active' && telephoneNumber && cleanPhone(user.telephoneNumber) === telephoneNumber
      );
      const sender = state.users.find(user => String(user.id) === currentUserId(req) && user.status === 'active');
      if (!sender || recipients.length !== 1) return { error: 'An active, unambiguous member wallet is required.' };
      const recipient = recipients[0];
      if (state.cycleWalletReview?.[String(recipient.id)]) return { error: 'Recipient wallet is on hold pending review.' };
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
      const balances = transferBalances(senderWallet, recipientWallet, amount);
      [senderWallet.balance, senderWallet.availableBalance, recipientWallet.balance, recipientWallet.availableBalance] = balances;
      const reference = `MEMBER-${randomUUID()}`;
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
      const result={ reference, recipientName: `${recipient.firstName} ${recipient.lastName}` };
      (state.walletTransferRequests??=[]).push({userId:currentUserId(req),key:requestKey,recipientTelephoneNumber:telephoneNumber,amountCents:moneyCents(amount),result,at:new Date().toISOString()});
      return result;
    });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(result);
  });

  router.post('/wallet/cash-out', async (req, res) => {
    if(readPlatformState().cycleWalletReview?.[currentUserId(req)])return res.status(409).json({message:'Wallet payments are on hold pending review of a Cycle refund or dispute.'});
    if (readPlatformState().realDataOnly) return res.status(503).json({ message: 'Cash-outs are unavailable until a payout provider is connected and verified.' });
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
    const result = await updatePlatformState((state) => {
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

  router.post('/referrals', async (req, res) => {
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
    const referral = await updatePlatformState((state) => {
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

  router.patch('/referrals/:id', async (req, res) => {
    const referral = await updatePlatformState(state =>
      acknowledgeReferral(state, currentUserId(req), req.params.id, req.body?.accepted));
    return res.json(referral);
  });

  router.get('/marketplace/listings', (_req, res) => {
    res.json(readPlatformState().marketplaceListings);
  });

  router.post('/marketplace/listings', async (req, res) => {
    const editable = listingCreation('marketplace',req.body);
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
    const listing = await updatePlatformState((state) => {
      const created = {
        ...editable,
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

  router.patch('/marketplace/listings/:id', async (req, res) => {
    let changes;
    try { changes = listingChanges('marketplace', req.body); }
    catch { return res.status(400).json({ message: 'Invalid listing changes.' }); }
    const listing = await updatePlatformState((state) => {
      const found = ownedListing(state.marketplaceListings, req.params.id, 'sellerUserId', currentUserId(req));
      if (found) Object.assign(found, changes);
      return found;
    });
    if (!listing) return res.status(404).json({ message: 'Listing not found.' });
    return res.json(listing);
  });

  router.post('/marketplace/listings/:id/conversations', async (req, res) => {
    const buyerUserId = currentUserId(req);
    const conversation = await updatePlatformState((platformState) => {
      const listing = conversationListing(platformState, 'marketplace', req.params.id, buyerUserId);
      const sellerUserId = String(listing.sellerUserId);
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

  router.post('/marketplace/conversations/:id/messages', async (req, res) => {
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

    const message = await updatePlatformState((platformState) => {
      writableConversation(platformState,'marketplace',conversation.id,senderUserId);
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

  router.use('/rides', (req,res,next) => {
    activeRideUser(readPlatformState(),currentUserId(req));
    res.set('Cache-Control','no-store');
    next();
  });
  router.get('/rides/available', (req, res) => res.json(visibleRideOffers(readPlatformState(),currentUserId(req),req.query.communityId)));

  router.get('/rides/offers/mine', (req, res) => {
    const offer = (readPlatformState().availableLifts ?? []).find(
      ({ driverUserId }) => String(driverUserId) === currentUserId(req)
    );
    return res.json(offer ?? null);
  });

  router.post('/rides/offers', async (req, res) => {
    const input = rideOfferInput(req.body);
    const offer = await updatePlatformState((platformState) => {
      const driver = activeRideUser(platformState,currentUserId(req));
      const business = ownedBusiness(platformState,req,req.body?.businessProfileId,'CATCH_A_RIDE');
      if(req.body?.businessProfileId&&!business)throw Object.assign(Error('Active owned ride business required.'),{status:403});
      platformState.availableLifts ??= [];
      const existing = platformState.availableLifts.find(
        ({ driverUserId }) => String(driverUserId) === currentUserId(req)
      );
      const details = {
        driverUserId: currentUserId(req),
        driverName:
          business?.businessName ?? `${driver.firstName} ${driver.lastName}`,
        driverTelephone: business?.telephone ?? driver.telephoneNumber,
        ...input,
        rating: existing?.rating ?? 5,
        distanceKm: existing?.distanceKm ?? 2,
        directionDegrees: existing?.directionDegrees ?? 90,
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

  router.patch('/rides/offers/mine', async (req, res) => {
    if(typeof req.body?.available!=='boolean')return res.status(400).json({message:'Choose a valid availability setting.'});
    const offer = await updatePlatformState((state) => {
      activeRideUser(state,currentUserId(req));
      const existing = (state.availableLifts ?? []).find(
        ({ driverUserId }) => String(driverUserId) === currentUserId(req)
      );
      if (!existing) return null;
      existing.available = req.body.available;
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
    return offer
      ? res.json(offer)
      : res.status(404).json({ message: 'No lift offer was found.' });
  });

  router.get('/rides/requests', (req, res) => res.json(visibleRideRequests(readPlatformState(),currentUserId(req))));

  router.post('/rides/requests', async (req, res) => {
    const {latitude,longitude}=rideLocation(req.body);
    if(typeof req.body?.liftId!=='string'||req.body.liftId.length>200)return res.status(400).json({message:'Choose a valid lift.'});

    const created = await updatePlatformState((platformState) => {
      const {passenger,lift}=requestableLift(platformState,currentUserId(req),req.body.liftId,req.body.communityId);
      platformState.rideRequests ??= [];
      const pending=platformState.rideRequests.find(request=>request.liftId===lift.id&&String(request.passengerUserId)===currentUserId(req)&&request.status==='PENDING');
      if(pending)return pending;
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
    return res.status(201).json(rideRequestView(created,currentUserId(req)));
  });

  router.patch('/rides/requests/:requestId', async (req, res) => {
    const requestedStatus = String(req.body?.status ?? '');
    if (!['ACCEPTED', 'DECLINED', 'CANCELLED'].includes(requestedStatus)) {
      return res.status(400).json({ message: 'Choose a valid ride request action.' });
    }

    const updated = await updatePlatformState((state) => {
      activeRideUser(state,currentUserId(req));
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
      if(requestedStatus!=='CANCELLED')requireCommunityPeer(state,userId,request.passengerUserId);
      if(requestedStatus==='ACCEPTED') {
        const lift=(state.availableLifts||[]).find(lift=>lift.id===request.liftId&&String(lift.driverUserId)===userId&&lift.available===true);
        if(!lift)throw Object.assign(Error('This lift is no longer available.'),{status:409});
      }
      request.status = requestedStatus;
      request.driverMessage =
        requestedStatus === 'ACCEPTED' ? 'On my way' : undefined;
      request.updatedAt = new Date().toISOString();
      return request;
    });

    return updated
      ? res.json(rideRequestView(updated,currentUserId(req)))
      : res.status(403).json({ message: 'This ride request cannot be updated.' });
  });

  router.get('/properties/listings', (_req, res) => {
    res.json(readPlatformState().propertyListings ?? []);
  });

  router.post('/properties/listings', async (req, res) => {
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

    const listing = await updatePlatformState((platformState) => {
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

  router.patch('/properties/listings/:id', async (req, res) => {
    const allowedStatuses = new Set([
      'AVAILABLE',
      'UNDER_OFFER',
      'RENTED',
      'SOLD',
      'WITHDRAWN'
    ]);
    const listing = await updatePlatformState((state) => {
      const found = (state.propertyListings ?? []).find(
        ({ id, ownerUserId }) => id === req.params.id && String(ownerUserId) === currentUserId(req)
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

  router.post('/properties/listings/:id/conversations', async (req, res) => {
    const interestedUserId = currentUserId(req);
    const conversation = await updatePlatformState((platformState) => {
      const listing = conversationListing(platformState, 'property', req.params.id, interestedUserId);
      const ownerUserId = String(listing.ownerUserId);
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

  router.post('/properties/conversations/:id/messages', async (req, res) => {
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
    const message = await updatePlatformState((platformState) => {
      writableConversation(platformState,'property',conversation.id,senderUserId);
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

  router.get('/jobs', (_req, res) => {
    res.json(readPlatformState().jobListings);
  });

  router.post('/jobs', async (req, res) => {
    const editable = listingCreation('job',req.body);
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
    const job = await updatePlatformState((state) => {
      const created = {
        ...editable,
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

  router.patch('/jobs/:id', async (req, res) => {
    let changes;
    try { changes = listingChanges('job', req.body); }
    catch { return res.status(400).json({ message: 'Invalid listing changes.' }); }
    const job = await updatePlatformState((state) => {
      const found = ownedListing(state.jobListings, req.params.id, 'listedByUserId', currentUserId(req));
      if (found) Object.assign(found, changes);
      return found;
    });
    if (!job) return res.status(404).json({ message: 'Job listing not found.' });
    return res.json(job);
  });

  return router;
}
