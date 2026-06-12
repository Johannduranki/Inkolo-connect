import jwt from 'jsonwebtoken';
import { getConfig } from './config.js';

export function createAccessToken(user) {
  const config = getConfig();

  return jwt.sign(
    {
      sub: String(user.id),
      name: `${user.first_name} ${user.last_name}`
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function requireAuth(req, res, next) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.auth = jwt.verify(token, getConfig().jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: 'Your session is invalid or has expired.' });
  }
}

