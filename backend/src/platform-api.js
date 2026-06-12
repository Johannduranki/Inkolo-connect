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
  const requireKznccAdmin = (req, res, next) => {
    const user = readPlatformState().users.find(
      ({ id }) => String(id) === currentUserId(req)
    );
    if (!user?.roles.includes('KZNCC Admin')) {
      return res.status(403).json({ message: 'KZNCC Admin access is required.' });
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
