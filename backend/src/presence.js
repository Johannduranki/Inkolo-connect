import express from 'express';
import { createHash } from 'node:crypto';

export class PresenceStore {
  constructor({ now = Date.now, ttl = 90000 } = {}) {
    this.now = now;
    this.ttl = ttl;
    this.sessions = new Map();
  }
  prune() {
    for (const [key, value] of this.sessions) if (value.expires <= this.now()) this.sessions.delete(key);
  }
  touch(key, userId, tokenExpiry) {
    this.prune();
    this.sessions.set(key, { userId: String(userId), expires: Math.min(this.now() + this.ttl, tokenExpiry * 1000) });
  }
  remove(key) { this.sessions.delete(key); }
  count(validIds) {
    this.prune();
    return new Set([...this.sessions.values()].filter(s => validIds.has(s.userId)).map(s => s.userId)).size;
  }
}

export function createPresenceRouter({ requireAuth, resolveUser, listUsers, store = new PresenceStore() }) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const key = req => createHash('sha256').update(req.get('authorization')).digest('hex');
  router.post('/heartbeat', (req, res) => {
    store.touch(key(req), req.auth.sub, req.auth.exp);
    res.sendStatus(204);
  });
  router.delete('/session', (req, res) => { store.remove(key(req)); res.sendStatus(204); });
  router.get('/summary', async (req, res, next) => {
    try {
      const user = await resolveUser(req.auth.sub);
      if (!user?.roles?.some(role => ['Platform Admin', 'DURANKI_ADMIN'].includes(role))) return res.status(403).json({ message: 'Platform administrator access required.' });
      const users = await listUsers();
      const validIds = new Set(users.filter(u => String(u.status).toLowerCase() === 'active').map(u => String(u.id)));
      res.json({ onlineUsers: store.count(validIds), totalUsers: new Set(users.map(u => String(u.id))).size, windowSeconds: store.ttl / 1000, measuredAt: new Date(store.now()).toISOString() });
    } catch (error) { next(error); }
  });
  return router;
}
