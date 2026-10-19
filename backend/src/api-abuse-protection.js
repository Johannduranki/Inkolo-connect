import { rateLimit } from 'express-rate-limit';

export function authenticatedRequestClass(req) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (path === '/api/auth/logout' || /^\/api\/presence(?:\/|$)/.test(path)) return null;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (/^\/api\/(?:platform\/wallet(?:\/|$)|cycle(?:\/|$)|treasury(?:\/|$)|subscriptions(?:\/|$))/.test(path)) return 'financial';
    return 'write';
  }
  if (req.method === 'GET' && /^\/api\/community-reports(?:\/|$)/.test(path)) return 'report';
  if (req.method === 'GET' && /^\/api\/platform\/community\/members\/?$/.test(path)) return 'search';
  return null;
}

export function createAuthenticatedAbuseProtection({ windowMs = 60000, limits = {} } = {}) {
  const applied = Symbol('authenticatedRateLimitApplied');
  const policies = { financial: 30, write: 90, report: 30, search: 60, ...limits };
  const middleware = Object.fromEntries(Object.entries(policies).map(([name, limit]) => [name, rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: req => String(req.auth.sub),
    handler: (_req, res) => res.status(429).set('Cache-Control', 'no-store').json({ message: 'Too many requests. Please wait before trying again.' })
  })]));
  return (req, res, next) => {
    // This middleware only runs after token, session, active-account and MFA checks.
    if (req.auth?.sub === undefined || req.auth?.sub === null) return res.status(401).json({ message: 'Authentication required.' });
    const category = authenticatedRequestClass(req);
    if (req[applied] || !category) return next();
    req[applied] = true;
    return middleware[category](req, res, next);
  };
}
