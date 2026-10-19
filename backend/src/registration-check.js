import express from 'express';
import { rateLimit } from 'express-rate-limit';

export function registrationPhone(value) {
  if (typeof value !== 'string' || value.length > 30) return '';
  const digits = value.replace(/[\s()+-]/g, '');
  const phone = /^27\d{9}$/.test(digits) ? '0'+digits.slice(2) : digits;
  return /^0\d{9}$/.test(phone) ? phone : '';
}

export function createRegistrationCheckRouter({exists}) {
  const router = express.Router();
  router.use(rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,
    message:{message:'Too many number checks. Please sign in or try again later.'}}));
  router.post('/',async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    const phone = registrationPhone(req.body?.telephoneNumber);
    if (!phone) return res.status(400).json({message:'Enter a valid South African telephone number.'});
    try {
      // Public lookup only confirms an existing account; never disclose roles or memberships.
      res.json({registered:Boolean(await exists(phone))});
    } catch(error) { next(error); }
  });
  return router;
}
