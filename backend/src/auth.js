import { signToken, verifyToken } from './token-security.js';
import { getConfig } from './config.js';

export async function createAccessToken(user, verifiedClaims = {}, sessions) {
  const config = getConfig();

  const token = signToken(
    {
      sub: String(user.id),
      ...verifiedClaims
    },
    config.jwtSecret,
    config.jwtExpiresIn
  );
  await sessions?.register(verifyToken(token, config.jwtSecret));
  return token;
}

export async function requireAuth(req, res, next) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.auth = verifyToken(token, getConfig().jwtSecret);
  } catch {
    return res.status(401).json({ message: 'Your session is invalid or has expired.' });
  }
  try {
    if(req.auth.purpose==='mfa')return res.status(403).json({code:'MFA_REQUIRED',message:'Complete Google Authenticator verification.'});
    if (req.app.locals.sessions && !await req.app.locals.sessions.allowed(req.auth, !req.originalUrl?.includes('/presence'))) return res.status(401).json({ message: 'Sign in again to continue.' });
    if(req.app.locals.mfa){
      const {store,resolveUser}=req.app.locals.mfa;
      const user=await resolveUser(req.auth.sub);
      if(!user||user.status!=='active')return res.status(401).json({message:'Account unavailable.'});
      if(!await store.allowed(user,req.auth))return res.status(403).json({code:'MFA_REQUIRED',message:'Sign in again and verify Google Authenticator.'});
      if(req.method==='POST' && /\/api\/treasury\/(payments\/[^/]+\/(approve|settle)|staff)/.test(req.originalUrl) && (!req.auth.mfaAt || Date.now()-req.auth.mfaAt>600000))return res.status(403).json({code:'MFA_REQUIRED',message:'Sign in again for a fresh verification before this financial action.'});
    }
    return next();
  } catch {
    return next(Object.assign(new Error('Authentication storage is temporarily unavailable.'), {status:503,code:'AUTH_STORAGE_UNAVAILABLE'}));
  }
}

