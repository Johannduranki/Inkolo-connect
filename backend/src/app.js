import express from 'express';
import { createWholesalerRouter } from './wholesaler-orders.js';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { signToken } from './token-security.js';
import { rateLimit } from 'express-rate-limit';
import { createAccessToken, requireAuth as authenticate } from './auth.js';
import { createAuthenticatedAbuseProtection } from './api-abuse-protection.js';
import { MysqlSessionStore, MysqlMfaStore } from './mysql-auth-store.js';
import { createPlatformRouter } from './platform-api.js';
import { createPresenceRouter } from './presence.js';
import { createCommunityRegistrationRouter, joinableCommunities } from './community-registration.js';
import { createRegistrationCheckRouter, registrationPhone } from './registration-check.js';
import { createTenantAccessRouter } from './tenant-access.js';
import { communityMembershipAccess } from './member-access.js';
import { createServicePricingRouter, configuredSubscriptionPlan } from './service-pricing.js';
import { createBrandingRouter } from './branding.js';
import { logger, requestLogging, errorDetails } from './logger.js';
import { createTreasuryRouter } from './treasury-api.js';
import { resolveTreasuryIdentity } from './treasury-identity.js';
import { createCycleRouter } from './cycle-api.js';
import { TrainingStore, createTrainingRouter } from './trader-training.js';
import { CycleStore, cycleConfig } from './cycle-pay.js';
import { CycleBilling } from './cycle-billing.js';
import { MysqlCycleStore } from './mysql-cycle-store.js';
import { MysqlCycleBilling } from './mysql-cycle-billing.js';
import { MysqlHeritageStore } from './mysql-heritage-store.js';
import { createMysqlHeritageRouter } from './mysql-heritage-api.js';
import { createCommunityReportsRouter } from './community-reports.js';
import { HeritageStore } from './heritage-store.js';
import { createHeritageRouter } from './heritage-api.js';
import { TreasuryStore } from './treasury-store.js';
import { MysqlTreasuryStore } from './mysql-treasury-store.js';
import { MysqlTrainingStore } from './mysql-training-store.js';
import { MfaStore, needsMfa } from './mfa.js';
import { createMfaRouter } from './mfa-api.js';
import { hashPassword, passwordPolicy, verifyPassword } from './password-security.js';
import { canReadUpload, validateUploadedFiles } from './upload-security.js';
import { SessionStore } from './session-security.js';
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
  saveDemoSubscription
} from './demo-store.js';
import { hashIdNumber, isValidIdNumber, lastFour, normalizeIdNumber } from './id-number.js';
import { readPlatformState, updatePlatformState, initializePlatformStorage, platformStorage } from './platform-store.js';
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
  'grant-distribution': {
    free: { amountCents: 0, label: 'Grant Distribution access' }
  },
  'trader-training': {
    free: { amountCents: 0, label: 'Trader Training access' }
  },
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
  'vuma-fibre': {
    free: { amountCents: 0, label: 'Vuma Force enquiry' }
  },
  'catch-a-ride': {
    free: { amountCents: 0, label: 'Catch a Lift access' }
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
  const abuseProtection = createAuthenticatedAbuseProtection();
  const requireAuth = (req, res, next) => authenticate(req, res, error => error ? next(error) : abuseProtection(req, res, next));

  app.disable('x-powered-by');
  app.use(requestLogging());
  app.use(helmet());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(Object.assign(new Error('Origin is not allowed by Duranki.'), { status: 403 }));
    }
  }));
  app.use('/api/cycle/notifications',express.raw({type:'application/json',limit:'128kb'}));
  app.use(express.json({ limit: '2mb' }));
  const treasuryDirectory = fileURLToPath(new URL('../data/', import.meta.url));
  mkdirSync(treasuryDirectory,{recursive:true});
  const treasuryCutover = path.join(treasuryDirectory,'treasury-storage-mode.json');
  const savedTreasuryStorage = existsSync(treasuryCutover) ? JSON.parse(readFileSync(treasuryCutover,'utf8')).storage : null;
  const treasuryStorage = process.env.TREASURY_STORAGE || savedTreasuryStorage || 'sqlite';
  if (savedTreasuryStorage === 'mariadb' && treasuryStorage !== 'mariadb') throw Error('Treasury has migrated to MariaDB. A verified reverse migration is required before rollback.');
  if (!['sqlite','mariadb'].includes(treasuryStorage)) throw Error('Unsupported treasury storage.');
  const treasuryStore = treasuryStorage === 'mariadb' ? new MysqlTreasuryStore(getPool()) : new TreasuryStore(path.join(treasuryDirectory,'treasury.sqlite'));
  const authCutover = path.join(treasuryDirectory,'auth-storage-mode.json');
  const savedAuthStorage = existsSync(authCutover) ? JSON.parse(readFileSync(authCutover,'utf8')).storage : null;
  const authStorage = process.env.AUTH_STORAGE || savedAuthStorage || 'sqlite';
  if (savedAuthStorage === 'mariadb' && authStorage !== 'mariadb') throw Error('Authentication has migrated to MariaDB. A verified reverse migration is required before rollback.');
  if (!['sqlite','mariadb'].includes(authStorage)) throw Error('Unsupported authentication storage.');
  const sessions = authStorage === 'mariadb' ? new MysqlSessionStore(getPool()) : new SessionStore(path.join(treasuryDirectory, 'sessions.sqlite'));
  app.locals.sessions = sessions;
  const mfaStore=authStorage === 'mariadb' ? new MysqlMfaStore(getPool(),path.join(treasuryDirectory,'mfa.key')) : new MfaStore(path.join(treasuryDirectory,'mfa.sqlite'),path.join(treasuryDirectory,'mfa.key'));
  app.locals.storageReady = Promise.all([initializePlatformStorage(getPool()),authStorage === 'mariadb' ? mfaStore.ready() : undefined,treasuryStorage === 'mariadb' ? treasuryStore.ready() : undefined]);
  const resolveMfaUser=async id=>{
    let user;
    if(databaseAvailable){
      const [rows]=await getPool().execute('SELECT * FROM users WHERE id=?',[id]);user=rows[0];
      if(!user)return null;
      const [roles]=await getPool().execute(`SELECT role_code AS role FROM user_roles WHERE user_id=?
        UNION SELECT role FROM user_tenant_role WHERE user_id=? AND status='ACTIVE'
        UNION SELECT role FROM user_community_role WHERE user_id=? AND status='ACTIVE'
        UNION SELECT 'Service Provider Admin' AS role FROM service_dashboard_admin WHERE user_id=? AND status='ACTIVE'`,[id,id,id,id]);
      user.roles=roles.map(r=>r.role);
    }else if(config.allowDemoAuth){user=getDemoUserById(id);}
    if(!user)return null;
    const staff=await treasuryStore.staffById(id);
    return {...user,roles:[...(user.roles||[]),...(staff && staff.version !== 'revoked'?[staff.role]:[])]};
  };
  app.locals.mfa={store:mfaStore,resolveUser:resolveMfaUser};
  app.use('/api/community-registration',createCommunityRegistrationRouter({requireAuth,resolveUser:resolveMfaUser,readState:readPlatformState,updateState:updatePlatformState,databaseAvailable}));
  const trainingCutover=path.join(treasuryDirectory,'training-storage-mode.json');
  const savedTrainingStorage=existsSync(trainingCutover)?JSON.parse(readFileSync(trainingCutover,'utf8')).storage:null;
  const trainingStorage=process.env.TRAINING_STORAGE||savedTrainingStorage||'sqlite';
  if(savedTrainingStorage==='mariadb'&&trainingStorage!=='mariadb')throw Error('Training rollback requires a verified reverse migration.');
  if(!['sqlite','mariadb'].includes(trainingStorage))throw Error('Unsupported training storage.');
  const trainingStore=trainingStorage==='mariadb'?new MysqlTrainingStore(getPool()):new TrainingStore(path.join(treasuryDirectory,'trader-training.sqlite'));
  app.locals.storageReady=Promise.all([app.locals.storageReady,trainingStorage==='mariadb'?trainingStore.ready():undefined]);
  app.use('/api/trader-training',createTrainingRouter({requireAuth,resolveUser:resolveMfaUser,readState:readPlatformState,store:trainingStore,databaseAvailable}));
  app.use('/api/branding',createBrandingRouter({requireAuth,resolveUser:resolveMfaUser,readState:readPlatformState,updateState:updatePlatformState}));
  app.use('/api/service-pricing',createServicePricingRouter({requireAuth,resolveUser:resolveMfaUser,readState:readPlatformState,updateState:updatePlatformState,checkoutReady:()=>!databaseAvailable&&cycleConfig().ready&&cycleBilling.settings().recurringReady}));
  app.use('/api/wholesalers',createWholesalerRouter({requireAuth,readState:readPlatformState,updateState:updatePlatformState,databaseAvailable,paidSubscriptions:id=>cycleBilling.active(id)}));
  const serviceStorage=name=>{
    const marker=path.join(treasuryDirectory,`${name}-storage-mode.json`);
    const saved=existsSync(marker)?JSON.parse(readFileSync(marker,'utf8')).storage:null;
    const selected=process.env[`${name.toUpperCase()}_STORAGE`]||saved||'sqlite';
    if(saved==='mariadb'&&selected!=='mariadb')throw Error(`${name} rollback requires a verified reverse migration.`);
    if(!['sqlite','mariadb'].includes(selected))throw Error('Unsupported service storage.');
    return selected;
  };
  const cycleStorage=serviceStorage('cycle'),heritageStorage=serviceStorage('heritage');
  const cycleStore=cycleStorage==='mariadb'?new MysqlCycleStore(getPool()):new CycleStore(path.join(treasuryDirectory,'cycle.sqlite'));
  const Billing=cycleStorage==='mariadb'?MysqlCycleBilling:CycleBilling;
  const cycleBilling=new Billing({store:cycleStore,readState:readPlatformState,updateState:updatePlatformState,config:cycleConfig,serviceReady:async(code,c)=>!['trader-training','grant-distribution'].includes(code)||(await trainingStore.list()).some(p=>p.community_id===c.id&&p.state==='PUBLISHED')});
  app.use('/api/cycle',createCycleRouter({requireAuth,resolveUser:resolveMfaUser,store:cycleStore,billing:cycleBilling,databaseAvailable}));
  if(!databaseAvailable){let renewing=false;const timer=setInterval(async()=>{if(renewing)return;renewing=true;try{await cycleBilling.renewDue();}catch(error){logger.error('cycle_renewal_failed',errorDetails(error));}finally{renewing=false;}},60000);timer.unref();app.locals.stopCycleBilling=()=>clearInterval(timer);}
  app.use('/api/community-reports',createCommunityReportsRouter({requireAuth,resolveUser:resolveMfaUser,readState:readPlatformState,cycleStore,treasuryStore,databaseAvailable}));
  app.use('/api/tenant-access', createTenantAccessRouter({requireAuth,readState:readPlatformState,updateState:updatePlatformState,databaseAvailable}));
  app.use('/api/presence', createPresenceRouter({ requireAuth, resolveUser: resolveMfaUser, listUsers: async () => {
    if (!databaseAvailable) return readPlatformState().users;
    const [rows] = await getPool().query('SELECT id, status FROM users');
    return rows;
  } }));
  const heritageStore=heritageStorage==='mariadb'?new MysqlHeritageStore(getPool()):new HeritageStore(path.join(treasuryDirectory,'heritage.sqlite'));
  app.locals.storageReady=Promise.all([app.locals.storageReady,cycleStorage==='mariadb'?cycleStore.ready():undefined,heritageStorage==='mariadb'?heritageStore.ready():undefined]);
  const heritageRouter=heritageStorage==='mariadb'?createMysqlHeritageRouter:createHeritageRouter;
  app.use('/api/heritage',heritageRouter({requireAuth,readState:readPlatformState,resolveUser:resolveMfaUser,store:heritageStore,databaseAvailable}));
  app.use('/api/auth/mfa',createMfaRouter({store:mfaStore,resolveUser:resolveMfaUser,sessions}));
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    await sessions.revoke(req.auth.jti);
    logger.info('authentication_logout', { requestId: req.requestId });
    return res.status(204).end();
  });
  app.use('/api/treasury', createTreasuryRouter({ requireAuth, store:treasuryStore,
    findUser:resolveMfaUser,
    resolveUser:(id,claims)=>resolveTreasuryIdentity(id,claims,resolveMfaUser,treasuryStore)
  }));
  const treasuryPublic = fileURLToPath(new URL('../../frontend/public/', import.meta.url));
  app.get('/private-downloads.js', (_req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(treasuryPublic, 'private-downloads.js')));
  app.get('/wallet-request-key.js', (_req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(treasuryPublic, 'wallet-request-key.js')));
  app.get('/catalogue-status.js',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,'catalogue-status.js')));
  app.get('/join-community',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,'join-community.html')));
  for(const file of ['join-community.js','community-registration-link.js'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  for(const file of ['admin-layout.js','admin-layout.css','admin-responsive.css'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  const sendDashboard = (res, file) => res.set('Cache-Control','no-store').type('html').send(readFileSync(path.join(treasuryPublic,file),'utf8').replace('</head>','<link rel="stylesheet" href="/admin-responsive.css"></head>').replace('</body>','<script src="/presence.js" data-presence-client="true" defer></script></body>'));
  app.get('/dashboard/wholesaler-orders',(_req,res)=>sendDashboard(res,'wholesaler-orders.html'));
  for(const file of ['wholesaler-orders.js','wholesaler-orders.css','wholesaler-navigation.js'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  app.get('/dashboard/community-reports',(_req,res)=>sendDashboard(res,'community-reports.html'));
  for(const file of ['community-reports.js','community-reports.css'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  app.get('/dashboard/service-pricing',(_req,res)=>sendDashboard(res,'service-pricing.html'));
  for(const route of ['/dashboard/trader-training','/dashboard/services/trader-training','/dashboard/services/grant-distribution'])app.get(route,(_req,res)=>sendDashboard(res,'trader-training.html'));
  for(const file of ['trader-training.js','trader-training.css','trader-training-navigation.js'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  app.get('/dashboard/branding',(_req,res)=>{res.set('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'; base-uri 'self'");sendDashboard(res,'branding.html');});
  for(const file of ['branding.js','branding-display.js'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  for(const file of ['service-pricing.js','service-pricing.css'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  app.get('/dashboard/heritage',(_req,res)=>sendDashboard(res,'heritage.html'));
  for(const file of ['heritage.js','heritage.css'])app.get('/'+file,(_req,res)=>res.sendFile(path.join(treasuryPublic,file)));
  app.get('/heritage-cytoscape.js',(_req,res)=>res.sendFile(fileURLToPath(new URL('../node_modules/cytoscape/dist/cytoscape.min.js',import.meta.url))));
  app.get('/dashboard/treasury', (_req,res) => sendDashboard(res,'treasury.html'));
  app.get('/dashboard/users', (_req,res) => sendDashboard(res,'user-directory.html'));
  app.get('/dashboard/tenant', (_req,res) => sendDashboard(res,'tenant-access.html'));
  app.get('/dashboard/cycle',(_req,res)=>sendDashboard(res,'cycle.html'));
  app.get('/payments/cycle',(_req,res)=>{
    res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self' https://sandbox.cyclepay.net https://payment.cyclepay.net; frame-ancestors 'self'; base-uri 'self'");
    sendDashboard(res,'cycle.html');
  });
  for(const file of ['cycle.js','cycle.css','cycle-billing-ui.js','cycle-billing-link.js','cycle-billing.css'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  app.get('/dashboard/services/:serviceCode', (_req,res) => sendDashboard(res,'service-unavailable.html'));
  for (const file of ['dashboard-switcher.js','tenant-operations.js','tenant-access.js','tenant-access.css','tenant-access-link.js']) app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  app.get('/two-factor', (_req,res) => res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,'two-factor.html')));
  for(const file of ['two-factor.css','google-authenticator.png'])app.get('/'+file,(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(treasuryPublic,file)));
  for (const file of ['treasury.js','treasury.css','treasury-navigation.js','two-factor.js','mfa-navigation.js','user-directory.js','presence.js','admin-navigation.js']) {
    app.get(`/${file}`, (_req,res) => res.sendFile(path.join(treasuryPublic,file)));
  }

  app.use(
    '/uploads',
    (req, res, next) => {
      if (/^\/community-logos\/[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(req.path)) return next();
      return requireAuth(req, res, async () => {
        try {
          const user = await resolveMfaUser(req.auth.sub);
          let allowed = canReadUpload(readPlatformState(), user, req.path);
          if (!allowed && databaseAvailable && /^\/[a-z0-9-]+\.(pdf|png|jpe?g)$/i.test(req.path)) {
            const file = path.join(uploadDirectory, req.path.slice(1));
            const [rows] = await getPool().execute('SELECT user_id FROM service_applications WHERE user_id = ? AND (bank_confirmation_path = ? OR id_document_path = ?) LIMIT 1', [req.auth.sub, file, file]);
            allowed = rows.length > 0;
          }
          if (!allowed) return res.status(404).json({ message: 'Document not found.' });
          res.set({ 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment', 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' });
          return next();
        } catch (error) { return next(error); }
      });
    },
    express.static(uploadDirectory, {
      fallthrough: false,
      maxAge: '1d'
    })
  );

  app.get('/api/health', (_req, res) => {
    if(platformStorage==='mariadb')readPlatformState();
    res.json({
      status: 'ok',
      storage: databaseAvailable ? 'mariadb' : 'persistent-demo',
      authenticationStorage: authStorage,
      treasuryStorage,
      platformStorage,
      walletStorage:platformStorage,
      trainingStorage,
      cycleStorage,
      heritageStorage
    });
  });

  app.use('/api/auth/registration-check',createRegistrationCheckRouter({exists:async phone=>{
    if(databaseAvailable){
      const [rows]=await getPool().execute('SELECT id FROM users WHERE id_number_hash = ? LIMIT 1',[hashIdNumber(phone,config.idPepper)]);
      return rows.length > 0;
    }
    if(!config.allowDemoAuth)throw Object.assign(new Error('Registration check is unavailable.'),{status:503});
    return readPlatformState().users.some(user=>registrationPhone(user.telephoneNumber)===phone);
  }}));

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

      if (!passwordPolicy(req.body?.password)) {
        return res.status(400).json({ message: 'Use a password of 15 to 1024 characters.' });
      }

      try {
        const passwordHash = await hashPassword(req.body.password);
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
              code: 'ACCOUNT_EXISTS', message: 'You are already registered. Do you want to register as a community member? Sign in to your existing account, then choose Join a community.'
            });
          }

          const connection = await pool.getConnection();
          try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
              `INSERT INTO users
                (id_number_hash, id_number_last4, first_name, last_name, email, status, password_hash)
               VALUES (?, ?, ?, ?, NULL, 'active', ?)`,
              [
                telephoneHash,
                lastFour(telephoneNumber),
                firstName,
                lastName,
                passwordHash
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
              code: 'ACCOUNT_EXISTS', message: 'You are already registered. Do you want to register as a community member? Sign in to your existing account, then choose Join a community.'
            });
          }

          user = await updatePlatformState((state) => {
            if(state.users.some(candidate=>normalizeTelephoneNumber(candidate.telephoneNumber)===telephoneNumber))throw Object.assign(Error('This account is already registered.'),{status:409});
            const id =
              Math.max(0, ...state.users.map(({ id }) => Number(id))) + 1;
            const created = {
              id,
              firstName,
              lastName,
              telephoneNumber,
              passwordHash,
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
            return created;
          });
          user = getDemoUserById(user.id);
        }

        if (!user) {
          return res.status(503).json({ message: 'Registration is unavailable.' });
        }

        return res.status(201).json({
          accessToken: await createAccessToken(user, {}, sessions),
          user: mapUser(user, lastFour(telephoneNumber))
        });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            code: 'ACCOUNT_EXISTS', message: 'You are already registered. Do you want to register as a community member? Sign in to your existing account, then choose Join a community.'
          });
        }
        return next(error);
      }
    }
  );

  app.post(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
      keyGenerator: req => createHash('sha256').update(normalizeTelephoneNumber(req.body?.telephoneNumber)).digest('hex'),
      message: { message: 'Too many login attempts. Please try again later.' } }),
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

        if (!/^\d{9,15}$/.test(telephoneNumber)) {
          return res.status(400).json({ message: 'Enter a valid telephone number.' });
        }

        let user;

        if (databaseAvailable) {
          const [rows] = await getPool().execute(
            `SELECT id, first_name, last_name, email, status, membership_type, password_hash
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
          logger.warn('authentication_failed', { requestId: req.requestId });
          return res.status(401).json({ message: 'Telephone number or password is incorrect.' });
        }

        const policyUser=await resolveMfaUser(user.id);
        const treasuryStaff = !databaseAvailable ? await treasuryStore.staffById(user.id) : null;
        const localUser = !databaseAvailable ? readPlatformState().users.find(u=>String(u.id)===String(user.id)) : null;
        const storedHash = databaseAvailable ? user.password_hash
          : String(user.id)==='1000001' && user.roles?.includes('Platform Admin') ? process.env.LOCAL_ADMIN_PASSWORD_HASH
          : treasuryStaff?.password_hash || localUser?.passwordHash;
        if (!await verifyPassword(req.body?.password, storedHash, config.idPepper)) {
          logger.warn('authentication_failed', { requestId: req.requestId });
          return res.status(401).json({ message: 'Telephone number or password is incorrect.' });
        }

        const verifiedClaims=!databaseAvailable && String(user.id)==='1000001' ? {treasury:'admin'} : treasuryStaff && treasuryStaff.version !== 'revoked' ? {treasury:treasuryStaff.version} : {};
        if(needsMfa(policyUser)){
          logger.info('authentication_mfa_challenge', { requestId: req.requestId });
          const jti=await mfaStore.begin(user.id,verifiedClaims);
          return res.json({mfaRequired:true,accessToken:signToken({sub:String(user.id),purpose:'mfa',jti},config.jwtSecret,'10m'),user:mapUser({...user,roles:policyUser.roles},lastFour(telephoneNumber))});
        }
        logger.info('authentication_succeeded', { requestId: req.requestId });
        return res.json({
          accessToken: await createAccessToken(user, verifiedClaims, sessions),
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

      const policyUser = await resolveMfaUser(req.auth.sub);
      return res.json({
        ...mapUser(user, user.id_number_last4 || '2086'),
        communityMembershipAccess: communityMembershipAccess(policyUser)
      });
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

      const primary=(readPlatformState().memberCommunities||[]).filter(m=>String(m.memberId)===String(req.auth.sub));
      const membership=primary.find(m=>m.isPrimary)||primary[0];
      const requestedCommunity=(typeof req.query.communityId==='string'?req.query.communityId:'')||membership?.communityId||membership?.churchId||'';
      const community=requestedCommunity?joinableCommunities(readPlatformState()).find(c=>c.id===requestedCommunity||c.aliases?.includes(requestedCommunity)):null;
      const paid=databaseAvailable||!community?[]:await cycleBilling.active(req.auth.sub,community.id);
      return res.json([...subscriptions,...(databaseAvailable?[]:await heritageStore.subscriptions(req.auth.sub)),...paid]);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/subscriptions', requireAuth, async (req, res, next) => {
    try {
      const { serviceCode, planCode, acceptance } = req.body ?? {};
      const plan = configuredSubscriptionPlan(readPlatformState(), serviceCode, planCode);
      if(plan.error)return res.status(plan.error).json({message:plan.message});

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
        await saveDemoAcceptance(evidence);
        subscription = await saveDemoSubscription(req.auth.sub, {
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
      await resetUserServiceData(req.auth.sub, databaseAvailable, {actorId:req.auth.sub,mode:'self'});
      if (!databaseAvailable && config.allowDemoAuth) {
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
    validateUploadedFiles,
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
          application = await saveDemoApplication(req.auth.sub, {
            serviceCode: 'step-up-boost',
            bankConfirmationPath: bankConfirmation.path,
            idDocumentPath: idDocument.path
          });
          await updatePlatformState(state => {
            state.privateUploadOwners ??= [];
            for (const file of [bankConfirmation, idDocument]) state.privateUploadOwners.push({ userId: String(req.auth.sub), path: `/${file.filename}` });
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
    createPlatformRouter({ requireAuth, databaseAvailable, additionalSubscriptions: id=>databaseAvailable?[]:heritageStore.subscriptions(id) })
  );
  app.use('/api', (_req, res) => res.status(404).json({ message: 'API endpoint not found.' }));

  if (existsSync(frontendDirectory)) {
    app.use(express.static(frontendDirectory, { maxAge: '1d', index: false }));
    app.get('*path', (_req, res) => {
      const source=readFileSync(path.join(frontendDirectory,'index.html'),'utf8').replace('</body>','<script src="/wholesaler-navigation.js" defer></script></body>');
      const html=source.includes('/wallet-request-key.js')?source:source.replace('</body>','<script src="/wallet-request-key.js" defer></script></body>');
      res.type('html').send(html.includes('/mfa-navigation.js')?html:html.replace('</body>','<script src="/mfa-navigation.js" defer></script></body>'));
    });
  }

  app.use((error, req, res, next) => {
    logger.error('request_failed',{requestId:req.requestId,...errorDetails(error)});
    if(res.headersSent)return next(error);
    const messages = { 400: 'Invalid request.', 401: 'Authentication required.', 403: 'Access denied.', 404: 'Resource not found.', 409: 'The request conflicts with the current record.', 413: 'The uploaded request is too large.', 429: 'Too many requests. Try again later.', 503: 'Service temporarily unavailable. Try again later.' };
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status;
    if (Object.hasOwn(messages, status)) return res.status(Number(status)).json({ message: messages[status] });
    res.status(500).json({ message: 'An unexpected server error occurred.' });
  });

  return app;
}
