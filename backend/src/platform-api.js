import express from 'express';
import { createPlatformId, readPlatformState, updatePlatformState } from './platform-store.js';

const cleanPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('27') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
};

const currentUserId = (req) => String(req.auth.sub);
const conversationKey = (first, second) => [String(first), String(second)].sort().join(':');

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

export function createPlatformRouter({ requireAuth }) {
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

  router.get('/profile', (req, res) => {
    const profile = readPlatformState().profiles.find(
      ({ userId }) => String(userId) === currentUserId(req)
    );
    res.json(profile ?? null);
  });

  router.put('/profile', (req, res) => {
    const userId = Number(req.auth.sub);
    const allowedFields = [
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
      ({ memberId }) => memberId === currentUserId(req)
    );
    res.json(membership ?? null);
  });

  router.put('/community/me', (req, res) => {
    const { churchId, branchId } = req.body ?? {};
    const state = readPlatformState();
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
      const saved = {
        memberId: currentUserId(req),
        churchId: church.id,
        churchName: church.name,
        branchId: branch?.id,
        branchName: branch?.branchName
      };
      const index = draft.memberCommunities.findIndex(
        ({ memberId }) => memberId === currentUserId(req)
      );
      if (index >= 0) draft.memberCommunities[index] = saved;
      else draft.memberCommunities.push(saved);
      return saved;
    });
    return res.json(membership);
  });

  router.get('/community/members', (req, res) => {
    const query = String(req.query.query ?? '').trim().toLowerCase();
    const state = readPlatformState();
    const membership = state.memberCommunities.find(
      ({ memberId }) => memberId === currentUserId(req)
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
    const current = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
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
        sellerName: current ? `${current.firstName} ${current.lastName}` : 'Member',
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

  router.get('/jobs', (_req, res) => {
    res.json(readPlatformState().jobListings);
  });

  router.post('/jobs', (req, res) => {
    const current = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ message: 'Enter a job title.' });
    const job = updatePlatformState((state) => {
      const created = {
        ...req.body,
        id: createPlatformId('job'),
        title,
        listedByUserId: currentUserId(req),
        listedByUserName: current ? `${current.firstName} ${current.lastName}` : 'Member',
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
