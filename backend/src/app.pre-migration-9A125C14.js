import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { createAccessToken, requireAuth } from './auth.js';
import { createPlatformRouter } from './platform-api.js';
import {
  createAcceptanceEvidence,
  saveDemoAcceptance
} from './legal-agreements.js';
import { getConfig } from './config.js';
import { getPool } from './database.js';
import {
  findDemoUser,
  getDemoSubscriptions,
  getDemoUserById,
  resetDemoUserServices,
  saveDemoApplication,
  saveDemoSubscription,
  updateDemoProfile
} from './demo-store.js';
import { hashIdNumber, isValidIdNumber, lastFour, normalizeIdNumber } from './id-number.js';
import { readPlatformState, updatePlatformState } from './platform-store.js';
import { resetUserServiceData } from './user-reset.js';

function mapUser(user, idNumberLast4 = user.id_number_last4) {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    idNumberLast4,
    membershipType: user.membership_type,
    roles: user.roles ?? ['Member']
  };
}

function normalizeTelephoneNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('27') && digits.length === 11
    ? `0${digits.slice(2)}`
    : digits;
}

function normalizeIdentityNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 32);
}

function normalizePassword(value) {
  return String(value ?? '');
}

function validatePassword(password) {
  return password.length >= 4
    ? ''
    : 'Enter your password or PIN. It must be at least 4 characters.';
}

function hashPassword(password, pepper) {
  return createHash('sha256')
    .update(`${pepper}:${password}`, 'utf8')
    .digest('hex');
}

function verifyPassword(password, expectedHash, pepper) {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const supplied = Buffer.from(hashPassword(password, pepper), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function assignRequestId(req, res, next) {
  const requestId = req.get('x-request-id') || randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

function securityAudit(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const shouldLog =
      req.path.startsWith('/api/auth') ||
      req.path.startsWith('/api/platform') ||
      res.statusCode >= 400;
    if (!shouldLog) return;
    console.info(JSON.stringify({
      event: 'security.audit',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      userId: req.auth?.sub ?? null,
      ip: req.ip,
      durationMs: Date.now() - startedAt
    }));
  });
  next();
}

function findDemoUserByTelephoneOrId(telephoneNumber, idNumber) {
  const state = readPlatformState();
  const byTelephone = state.users.find(
    (candidate) =>
      normalizeTelephoneNumber(candidate.telephoneNumber) === telephoneNumber
  );
  if (byTelephone) return byTelephone;
  if (!idNumber) return null;
  const profile = (state.profiles ?? []).find(
    (candidate) => normalizeIdentityNumber(candidate.idNumber) === idNumber
  );
  if (!profile) return null;
  return state.users.find(({ id }) => String(id) === String(profile.userId)) ?? null;
}

function validateMemberDetails(firstName, lastName, telephoneNumber) {
  if (
    !/^[\p{L}][\p{L}\s'-]{1,99}$/u.test(firstName) ||
    !/^[\p{L}][\p{L}\s'-]{1,99}$/u.test(lastName)
  ) {
    return 'Enter your name and surname.';
  }
  if (!/^0\d{9}$/.test(telephoneNumber)) {
    return 'Enter a valid 10-digit South African telephone number.';
  }
  return '';
}

const servicePlans = {
  'build-up-balance': {
    free: { amountCents: 0, label: 'Buy and Sell access' }
  },
  marketplace: {
    free: { amountCents: 0, label: 'Marketplace access' }
  },
  funeral: {
    single: { amountCents: 5000, label: 'Single subscription' },
    family: { amountCents: 7500, label: 'Family subscription' },
    'african-bank': { amountCents: 2500, label: 'African Bank Funeral Cover' },
    'single-african-bank': {
      amountCents: 7500,
      label: 'Inkolo Single Cover + African Bank Funeral Cover'
    },
    'family-african-bank': {
      amountCents: 10000,
      label: 'Inkolo Family Cover + African Bank Funeral Cover'
    }
  },
  'funeral-cover': {
    free: { amountCents: 0, label: 'Funeral Cover access' }
  },
  community: {
    free: { amountCents: 0, label: 'Free access' }
  },
  'community-membership': {
    monthly: { amountCents: 2500, label: 'Community Membership monthly access' }
  },
  referral: {
    free: { amountCents: 0, label: 'Referral access' }
  },
  'job-search': {
    free: { amountCents: 0, label: 'Job Search access' }
  },
  jobs: {
    free: { amountCents: 0, label: 'Jobs & Gigs access' }
  },
  'vas-services': {
    free: { amountCents: 0, label: 'VAS Services access' },
    'airtime-data': { amountCents: 0, label: 'Buy Airtime or Data' },
    electricity: { amountCents: 0, label: 'Prepaid Electricity' }
  },
  airtime: {
    free: { amountCents: 0, label: 'Airtime access' }
  },
  utilities: {
    free: { amountCents: 0, label: 'Utilities access' }
  },
  payments: {
    free: { amountCents: 0, label: 'Payments access' }
  },
  eduu: {
    free: { amountCents: 0, label: 'EduU access' }
  },
  education: {
    free: { amountCents: 0, label: 'Education access' }
  },
  'grant-distribution': {
    free: { amountCents: 0, label: 'Grant Distribution access' }
  },
  'trader-training': {
    free: { amountCents: 0, label: 'Trader Training access' }
  },
  'uif-trader-training': {
    free: { amountCents: 0, label: 'Trader Training access' }
  },
  'vuma-fibre': {
    free: { amountCents: 0, label: 'Vuma Force enquiry' }
  },
  vuma: {
    free: { amountCents: 0, label: 'Vuma Force enquiry' }
  },
  internet: {
    free: { amountCents: 0, label: 'Internet access' }
  },
  'catch-a-ride': {
    free: { amountCents: 0, label: 'Catch a Lift access' }
  },
  transport: {
    free: { amountCents: 0, label: 'Transport access' }
  },
  deliveries: {
    free: { amountCents: 0, label: 'Deliveries access' }
  },
  kzncc: {
    monthly: { amountCents: 700, label: 'KZNCC monthly membership' }
  },
  'keycha-properties': {
    free: { amountCents: 0, label: 'Property marketplace access' }
  },
  'business-services': {
    free: { amountCents: 0, label: 'Business Services access' }
  },
  projects: {
    free: { amountCents: 0, label: 'Projects access' }
  },
  loans: {
    free: { amountCents: 0, label: 'Loans access' }
  },
  pos: {
    free: { amountCents: 0, label: 'POS access' }
  },
  wallet: {
    free: { amountCents: 0, label: 'Wallet access' }
  }
};

const uploadDirectory = path.resolve('uploads');
mkdirSync(uploadDirectory, { recursive: true });

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(
  sourceDirectory,
  '../../frontend/dist/duranki-login/browser'
);

const allowedDocumentTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);
const allowedDocumentExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

const applicationUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, allowedDocumentTypes.has(file.mimetype) && allowedDocumentExtensions.has(extension));
  }
});

function mapSubscription(row) {
  return {
    serviceCode: row.service_code ?? row.serviceCode,
    planCode: row.plan_code ?? row.planCode,
    planLabel: row.plan_label ?? row.planLabel,
    amountCents: row.amount_cents ?? row.amountCents,
    status: row.status,
    subscribedAt: row.created_at ?? row.subscribedAt
  };
}

export function createApp({ databaseAvailable = true } = {}) {
  const config = getConfig();
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(assignRequestId);
  app.use(securityAudit);
  app.use(helmet({
    contentSecurityPolicy: config.isProduction ? undefined : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: config.isProduction
      ? { maxAge: 15552000, includeSubDomains: true, preload: true }
      : false
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      const error = new Error('Origin is not allowed by Duranki.');
      error.statusCode = 403;
      callback(error);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id']
  }));
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down and try again shortly.' }
  }));
  app.use(express.json({ limit: '1mb', strict: true }));
  app.use(
    '/uploads',
    express.static(uploadDirectory, {
      fallthrough: false,
      maxAge: '1d',
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment');
      }
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      storage: databaseAvailable ? 'mariadb' : 'persistent-demo'
    });
  });

  app.post(
    '/api/auth/register',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { message: 'Too many registration attempts. Please try again later.' }
    }),
    async (req, res, next) => {
      const firstName = String(req.body?.firstName ?? '').trim();
      const lastName = String(req.body?.lastName ?? '').trim();
      const telephoneNumber = normalizeTelephoneNumber(req.body?.telephoneNumber);
      const password = normalizePassword(req.body?.password);
      const identity = req.body?.identity && typeof req.body.identity === 'object'
        ? req.body.identity
        : {};
      const idNumber = normalizeIdentityNumber(identity.idNumber);
      const dateOfBirth = String(identity.dateOfBirth ?? '').slice(0, 10);
      const gender = String(identity.gender ?? '').trim().slice(0, 32);
      const identityVerificationMethod =
        String(identity.verificationMethod ?? 'MANUAL').trim().slice(0, 50) || 'MANUAL';
      const validationError = validateMemberDetails(
        firstName,
        lastName,
        telephoneNumber
      ) || validatePassword(password);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      try {
        let user;

        if (databaseAvailable) {
          const pool = getPool();
          const telephoneHash = hashIdNumber(telephoneNumber, config.idPepper);
          const [existingRows] = await pool.execute(
            `SELECT u.id
               FROM users u
               LEFT JOIN member_profiles mp ON mp.user_id = u.id
              WHERE u.id_number_hash = ?
                 OR (? <> '' AND REPLACE(COALESCE(mp.id_number, ''), ' ', '') = ?)
              LIMIT 1`,
            [telephoneHash, idNumber, idNumber]
          );
          if (existingRows.length) {
            return res.status(409).json({
              message: 'A member with this telephone number or ID number is already registered.'
            });
          }

          const connection = await pool.getConnection();
          try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
              `INSERT INTO users
                (id_number_hash, id_number_last4, first_name, last_name, email, password_hash, status)
               VALUES (?, ?, ?, ?, NULL, ?, 'active')`,
              [
                telephoneHash,
                lastFour(telephoneNumber),
                firstName,
                lastName,
                hashPassword(password, config.idPepper)
              ]
            );
            const userId = Number(result.insertId);
            await connection.execute(
              'INSERT INTO user_roles (user_id, role_code) VALUES (?, ?)',
              [userId, 'Member']
            );
            await connection.execute(
              `INSERT INTO member_profiles
                (user_id, telephone_number, email, address, city, postal_code,
                 emergency_contact_name, emergency_contact_number, id_number,
                 date_of_birth, gender, identity_verification_method)
               VALUES (?, ?, NULL, '', '', '', '', '', ?, ?, ?, ?)`,
              [
                userId,
                telephoneNumber,
                idNumber || null,
                dateOfBirth || null,
                gender || null,
                identityVerificationMethod
              ]
            );
            await connection.execute(
              `INSERT INTO wallets
                (id, owner_type, owner_id, wallet_name, balance, available_balance,
                 pending_balance, currency, status)
               VALUES (?, 'MEMBER', ?, ?, 0, 0, 0, 'ZAR', 'ACTIVE')`,
              [
                `member-${userId}`,
                String(userId),
                `${firstName} ${lastName} Wallet`
              ]
            );
            await connection.commit();
            user = {
              id: userId,
              first_name: firstName,
              last_name: lastName,
              email: null,
              roles: ['Member'],
              status: 'active',
              membership_type: null
            };
          } catch (error) {
            await connection.rollback();
            throw error;
          } finally {
            connection.release();
          }
        } else if (config.allowDemoAuth) {
          const existing = findDemoUserByTelephoneOrId(telephoneNumber, idNumber);
          if (existing) {
            return res.status(409).json({
              message: 'A member with this telephone number or ID number is already registered.'
            });
          }

          user = updatePlatformState((state) => {
            const id =
              Math.max(0, ...state.users.map(({ id }) => Number(id))) + 1;
            const created = {
              id,
              firstName,
              lastName,
              telephoneNumber,
              email: null,
              passwordHash: hashPassword(password, config.idPepper),
              roles: ['Member'],
              status: 'active'
            };
            state.users.push(created);
            state.profiles.push({
              userId: id,
              idNumber,
              dateOfBirth,
              gender,
              identityVerificationMethod,
              telephoneNumber,
              email: '',
              address: '',
              city: '',
              postalCode: '',
              emergencyContactName: '',
              emergencyContactNumber: ''
            });
            state.wallets.push({
              id: `member-${id}`,
              ownerType: 'MEMBER',
              ownerId: String(id),
              walletName: `${firstName} ${lastName} Wallet`,
              balance: 0,
              availableBalance: 0,
              pendingBalance: 0,
              currency: 'ZAR',
              status: 'ACTIVE'
            });
            return getDemoUserById(id);
          });
        }

        if (!user) {
          return res.status(503).json({ message: 'Registration is unavailable.' });
        }

        return res.status(201).json({
          accessToken: createAccessToken(user),
          user: mapUser(user, lastFour(telephoneNumber))
        });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            message: 'A member with this telephone number is already registered.'
          });
        }
        return next(error);
      }
    }
  );

  app.post(
    '/api/auth/registration-status',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { message: 'Too many registration checks. Please try again later.' }
    }),
    async (req, res, next) => {
      try {
        const telephoneNumber = normalizeTelephoneNumber(req.body?.telephoneNumber);
        const password = normalizePassword(req.body?.password);
        const identity = req.body?.identity && typeof req.body.identity === 'object'
          ? req.body.identity
          : {};
        const idNumber = normalizeIdentityNumber(identity.idNumber);

        if (!/^\d{9,15}$/.test(telephoneNumber)) {
          return res.status(400).json({ message: 'Enter a valid telephone number.' });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
          return res.status(400).json({ message: passwordError });
        }

        let user;

        if (databaseAvailable) {
          const [rows] = await getPool().execute(
            `SELECT id, first_name, last_name, email, password_hash, status, membership_type
               FROM (
                 SELECT u.*
                   FROM users u
                   LEFT JOIN member_profiles mp ON mp.user_id = u.id
                  WHERE u.id_number_hash = ?
                     OR (? <> '' AND REPLACE(COALESCE(mp.id_number, ''), ' ', '') = ?)
                  LIMIT 1
               ) matched_user
              LIMIT 1`,
            [hashIdNumber(telephoneNumber, config.idPepper), idNumber, idNumber]
          );
          user = rows[0];
          const expectedPasswordHash =
            user?.password_hash ?? hashPassword(config.demoPassword, config.idPepper);
          if (user && !verifyPassword(password, expectedPasswordHash, config.idPepper)) {
            return res.status(401).json({ message: 'Telephone number or password is incorrect.' });
          }
        } else if (config.allowDemoAuth) {
          const platformUser = findDemoUserByTelephoneOrId(telephoneNumber, idNumber);
          if (platformUser) {
            const expectedPasswordHash =
              platformUser.passwordHash ?? hashPassword(config.demoPassword, config.idPepper);
            if (!verifyPassword(password, expectedPasswordHash, config.idPepper)) {
              return res.status(401).json({ message: 'Telephone number or password is incorrect.' });
            }
            user = findDemoUser(telephoneNumber, config.idPepper);
          }
        }

        if (!user || user.status !== 'active') {
          return res.json({ registered: false, communities: [] });
        }

        const userId = String(user.id);
        const communities = readPlatformState()
          .memberCommunities
          .filter(
            (membership) =>
              String(membership.memberId) === userId && !membership.pendingReselect
          )
          .map((membership) => ({
            memberId: String(membership.memberId),
            churchId: membership.churchId,
            churchName: membership.churchName,
            branchId: membership.branchId,
            branchName: membership.branchName
          }));

        return res.json({
          registered: true,
          accessToken: createAccessToken(user),
          user: mapUser(user, lastFour(telephoneNumber)),
          communities
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.post(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { message: 'Too many login attempts. Please try again later.' }
    }),
    async (req, res, next) => {
      try {
        const telephoneNumber = normalizeTelephoneNumber(req.body?.telephoneNumber);
        const firstName = String(req.body?.firstName ?? '').trim();
        const lastName = String(req.body?.lastName ?? '').trim();
        const password = normalizePassword(req.body?.password);

        if (!/^\d{9,15}$/.test(telephoneNumber)) {
          return res.status(400).json({ message: 'Enter a valid telephone number.' });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
          return res.status(400).json({ message: passwordError });
        }

        let user;

        if (databaseAvailable) {
          const [rows] = await getPool().execute(
            `SELECT id, first_name, last_name, email, password_hash, status, membership_type
               FROM users
              WHERE id_number_hash = ?
              LIMIT 1`,
            [hashIdNumber(telephoneNumber, config.idPepper)]
          );
          user = rows[0];
        } else if (config.allowDemoAuth) {
          const platformUser = readPlatformState().users.find(
            (candidate) =>
              normalizeTelephoneNumber(candidate.telephoneNumber) === telephoneNumber
          );
          const expectedPasswordHash =
            platformUser?.passwordHash ?? hashPassword(config.demoPassword, config.idPepper);
          if (!verifyPassword(password, expectedPasswordHash, config.idPepper)) {
            return res.status(401).json({ message: 'Telephone number or password is incorrect.' });
          }
          user = findDemoUser(telephoneNumber, config.idPepper);
        }

        if (!user || user.status !== 'active') {
          return res.status(401).json({ message: 'Telephone number or password is incorrect.' });
        }

        if (databaseAvailable) {
          const expectedPasswordHash =
            user.password_hash ?? hashPassword(config.demoPassword, config.idPepper);
          if (!verifyPassword(password, expectedPasswordHash, config.idPepper)) {
            return res.status(401).json({ message: 'Telephone number or password is incorrect.' });
          }
        }

        if (databaseAvailable && firstName && lastName) {
          await getPool().execute(
            'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
            [firstName, lastName, user.id]
          );
          user.first_name = firstName;
          user.last_name = lastName;
        } else if (config.allowDemoAuth && firstName && lastName) {
          user = updateDemoProfile(user.id, firstName, lastName);
        }

        return res.json({
          accessToken: createAccessToken(user),
          user: mapUser(user, lastFour(telephoneNumber))
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.get('/api/auth/me', requireAuth, async (req, res, next) => {
    try {
      let user;

      if (databaseAvailable) {
        const [rows] = await getPool().execute(
          `SELECT id, first_name, last_name, email, id_number_last4, membership_type
             FROM users
            WHERE id = ? AND status = 'active'
            LIMIT 1`,
          [req.auth.sub]
        );
        user = rows[0];
      } else if (config.allowDemoAuth) {
        user = getDemoUserById(req.auth.sub);
      }

      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      return res.json(mapUser(user, user.id_number_last4 || '2086'));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/subscriptions', requireAuth, async (req, res, next) => {
    try {
      let subscriptions;

      if (databaseAvailable) {
        const [rows] = await getPool().execute(
          `SELECT service_code, plan_code, amount_cents, status, created_at
             FROM service_subscriptions
            WHERE user_id = ? AND status = 'active'
            ORDER BY created_at DESC`,
          [req.auth.sub]
        );
        subscriptions = rows.map((row) => {
          const plan = servicePlans[row.service_code]?.[row.plan_code];
          return mapSubscription({ ...row, plan_label: plan?.label ?? row.plan_code });
        });
      } else if (config.allowDemoAuth) {
        subscriptions = getDemoSubscriptions(req.auth.sub).map(mapSubscription);
      } else {
        subscriptions = [];
      }

      return res.json(subscriptions);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/subscriptions', requireAuth, async (req, res, next) => {
    try {
      const { serviceCode, planCode, acceptance } = req.body ?? {};
      const plan = servicePlans[serviceCode]?.[planCode];

      if (!plan) {
        return res.status(400).json({ message: 'Choose a valid service plan.' });
      }
      if (acceptance?.accepted !== true) {
        return res.status(400).json({
          message: 'Accept the Terms and Conditions before activating this service.'
        });
      }

      let subscription;
      let acceptingUser;

      if (databaseAvailable) {
        const [userRows] = await getPool().execute(
          `SELECT id, first_name, last_name, email, id_number_last4
             FROM users
            WHERE id = ? AND status = 'active'
            LIMIT 1`,
          [req.auth.sub]
        );
        acceptingUser = userRows[0];
        if (!acceptingUser) {
          return res.status(404).json({ message: 'User not found.' });
        }
        const evidence = createAcceptanceEvidence({
          user: acceptingUser,
          serviceCode,
          planCode,
          request: req
        });
        const connection = await getPool().getConnection();
        try {
          await connection.beginTransaction();
          await connection.execute(
            `INSERT INTO legal_acceptances
              (id, user_id, member_name, member_telephone, member_email,
               service_code, service_name, plan_code, document_title,
               document_version, document_sha256, document_mime_type,
               document_source_file, document_snapshot, consent_statement,
               accepted_at, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              evidence.id,
              req.auth.sub,
              evidence.memberName,
              evidence.memberTelephone,
              evidence.memberEmail,
              serviceCode,
              evidence.serviceName,
              planCode,
              evidence.documentTitle,
              evidence.documentVersion,
              evidence.documentSha256,
              evidence.documentMimeType,
              evidence.documentSourceFile,
              evidence.documentSnapshot,
              evidence.consentStatement,
              evidence.acceptedAt,
              evidence.ipAddress,
              evidence.userAgent
            ]
          );
          await connection.execute(
            `INSERT INTO service_subscriptions
              (user_id, service_code, plan_code, amount_cents, status)
             VALUES (?, ?, ?, ?, 'active')
             ON DUPLICATE KEY UPDATE
              plan_code = VALUES(plan_code),
              amount_cents = VALUES(amount_cents),
              status = 'active'`,
            [req.auth.sub, serviceCode, planCode, plan.amountCents]
          );
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
        subscription = {
          serviceCode,
          planCode,
          planLabel: plan.label,
          amountCents: plan.amountCents,
          status: 'active',
          subscribedAt: new Date().toISOString()
        };
      } else if (config.allowDemoAuth) {
        acceptingUser = getDemoUserById(req.auth.sub);
        const evidence = createAcceptanceEvidence({
          user: acceptingUser,
          serviceCode,
          planCode,
          request: req
        });
        saveDemoAcceptance(evidence);
        subscription = saveDemoSubscription(req.auth.sub, {
          serviceCode,
          planCode,
          planLabel: plan.label,
          amountCents: plan.amountCents
        });
      }

      if (!subscription) {
        return res.status(503).json({ message: 'Subscriptions are unavailable.' });
      }

      return res.status(201).json(mapSubscription(subscription));
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/subscriptions', requireAuth, async (req, res, next) => {
    try {
      if (!databaseAvailable && config.allowDemoAuth) {
        resetDemoUserServices(req.auth.sub);
      }
      await resetUserServiceData(req.auth.sub, databaseAvailable);

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  app.post(
    '/api/applications/step-up-boost',
    requireAuth,
    applicationUpload.fields([
      { name: 'bankConfirmation', maxCount: 1 },
      { name: 'idDocument', maxCount: 1 }
    ]),
    async (req, res, next) => {
      try {
        const bankConfirmation = req.files?.bankConfirmation?.[0];
        const idDocument = req.files?.idDocument?.[0];

        if (!bankConfirmation || !idDocument) {
          return res.status(400).json({
            message: 'Upload both a bank confirmation letter and an ID document.'
          });
        }

        let application;

        if (databaseAvailable) {
          await getPool().execute(
            `INSERT INTO service_applications
              (user_id, service_code, status, bank_confirmation_path, id_document_path)
             VALUES (?, 'step-up-boost', 'submitted', ?, ?)
             ON DUPLICATE KEY UPDATE
              status = 'submitted',
              bank_confirmation_path = VALUES(bank_confirmation_path),
              id_document_path = VALUES(id_document_path)`,
            [req.auth.sub, bankConfirmation.path, idDocument.path]
          );
          application = {
            serviceCode: 'step-up-boost',
            status: 'submitted',
            submittedAt: new Date().toISOString()
          };
        } else if (config.allowDemoAuth) {
          application = saveDemoApplication(req.auth.sub, {
            serviceCode: 'step-up-boost',
            bankConfirmationPath: bankConfirmation.path,
            idDocumentPath: idDocument.path
          });
        }

        return res.status(201).json({
          serviceCode: application.serviceCode,
          status: application.status,
          submittedAt: application.submittedAt
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.use(
    '/api/platform',
    createPlatformRouter({ requireAuth, databaseAvailable })
  );

  if (existsSync(frontendDirectory)) {
    app.use(express.static(frontendDirectory, { maxAge: '1d', index: false }));
    app.get('*path', (_req, res) => {
      res.sendFile(path.join(frontendDirectory, 'index.html'));
    });
  }

  app.use((error, req, res, _next) => {
    const statusCode = Number(error?.statusCode || error?.status || 500);
    console.error(JSON.stringify({
      event: 'server.error',
      requestId: req.requestId,
      statusCode,
      message: error?.message
    }));
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      message: statusCode === 403
        ? 'This request is not allowed.'
        : 'An unexpected server error occurred.',
      requestId: req.requestId
    });
  });

  return app;
}
