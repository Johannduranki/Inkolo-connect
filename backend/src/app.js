import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
  community: {
    free: { amountCents: 0, label: 'Free access' }
  },
  referral: {
    free: { amountCents: 0, label: 'Referral access' }
  },
  'job-search': {
    free: { amountCents: 0, label: 'Job Search access' }
  },
  'vas-services': {
    free: { amountCents: 0, label: 'VAS Services access' },
    'airtime-data': { amountCents: 0, label: 'Buy Airtime or Data' },
    electricity: { amountCents: 0, label: 'Prepaid Electricity' }
  },
  eduu: {
    free: { amountCents: 0, label: 'EduU access' }
  },
  'vuma-fibre': {
    free: { amountCents: 0, label: 'Vuma Fibre enquiry' }
  },
  'catch-a-ride': {
    free: { amountCents: 0, label: 'Catch a Ride access' }
  },
  kzncc: {
    monthly: { amountCents: 700, label: 'KZNCC monthly membership' }
  },
  'keycha-properties': {
    free: { amountCents: 0, label: 'Property marketplace access' }
  },
  wallet: {
    free: { amountCents: 0, label: 'Wallet access' }
  }
};

const uploadDirectory = path.resolve('uploads');
mkdirSync(uploadDirectory, { recursive: true });

const allowedDocumentTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);

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
    callback(null, allowedDocumentTypes.has(file.mimetype));
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

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin }));
  app.use(express.json({ limit: '10kb' }));

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
      const validationError = validateMemberDetails(
        firstName,
        lastName,
        telephoneNumber
      );

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      try {
        let user;

        if (databaseAvailable) {
          const pool = getPool();
          const telephoneHash = hashIdNumber(telephoneNumber, config.idPepper);
          const [existingRows] = await pool.execute(
            'SELECT id FROM users WHERE id_number_hash = ? LIMIT 1',
            [telephoneHash]
          );
          if (existingRows.length) {
            return res.status(409).json({
              message: 'A member with this telephone number is already registered.'
            });
          }

          const connection = await pool.getConnection();
          try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
              `INSERT INTO users
                (id_number_hash, id_number_last4, first_name, last_name, email, status)
               VALUES (?, ?, ?, ?, NULL, 'active')`,
              [
                telephoneHash,
                lastFour(telephoneNumber),
                firstName,
                lastName
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
                 emergency_contact_name, emergency_contact_number)
               VALUES (?, ?, NULL, '', '', '', '', '')`,
              [userId, telephoneNumber]
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
          const existing = readPlatformState().users.find(
            (candidate) =>
              normalizeTelephoneNumber(candidate.telephoneNumber) === telephoneNumber
          );
          if (existing) {
            return res.status(409).json({
              message: 'A member with this telephone number is already registered.'
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
              roles: ['Member'],
              status: 'active'
            };
            state.users.push(created);
            state.profiles.push({
              userId: id,
              idNumber: '',
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

        if (!/^\d{9,15}$/.test(telephoneNumber)) {
          return res.status(400).json({ message: 'Enter a valid telephone number.' });
        }

        if (
          !/^[\p{L}][\p{L}\s'-]{1,99}$/u.test(firstName) ||
          !/^[\p{L}][\p{L}\s'-]{1,99}$/u.test(lastName)
        ) {
          return res.status(400).json({ message: 'Enter your name and surname.' });
        }

        let user;

        if (databaseAvailable) {
          const [rows] = await getPool().execute(
            `SELECT id, first_name, last_name, email, status, membership_type
               FROM users
              WHERE id_number_hash = ?
              LIMIT 1`,
            [hashIdNumber(telephoneNumber, config.idPepper)]
          );
          user = rows[0];
        } else if (config.allowDemoAuth) {
          user = findDemoUser(telephoneNumber, config.idPepper);
        }

        if (!user || user.status !== 'active') {
          return res.status(401).json({ message: 'Telephone number not recognized.' });
        }

        if (databaseAvailable) {
          await getPool().execute(
            'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
            [firstName, lastName, user.id]
          );
          user.first_name = firstName;
          user.last_name = lastName;
        } else if (config.allowDemoAuth) {
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
      if (databaseAvailable) {
        await getPool().execute(
          'DELETE FROM service_applications WHERE user_id = ?',
          [req.auth.sub]
        );
        await getPool().execute(
          'DELETE FROM service_subscriptions WHERE user_id = ?',
          [req.auth.sub]
        );
      } else if (config.allowDemoAuth) {
        resetDemoUserServices(req.auth.sub);
      }

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

  app.use('/api/platform', createPlatformRouter({ requireAuth }));

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ message: 'An unexpected server error occurred.' });
  });

  return app;
}
