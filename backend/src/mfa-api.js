import express from 'express';
import { verifyToken } from './token-security.js';
import QRCode from 'qrcode';
import { rateLimit } from 'express-rate-limit';
import { getConfig } from './config.js';
import { createAccessToken } from './auth.js';
import { needsMfa } from './mfa.js';

export function createMfaRouter({store,resolveUser,sessions}) {
  const router=express.Router();
  router.use(rateLimit({windowMs:15*60*1000,limit:50,standardHeaders:'draft-7',legacyHeaders:false}));
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    try{const header=req.get('authorization')||'';req.auth=verifyToken(header.startsWith('Bearer ')?header.slice(7):'',getConfig().jwtSecret);next();}
    catch{return res.status(401).json({message:'Sign in again to continue.'});}
  });
  router.get('/status',async(req,res,next)=>{
    try {
      const user=await resolveUser(req.auth.sub);
      if(!user||user.status!=='active')return res.sendStatus(401);
      if(req.auth.purpose==='mfa'){
        try {
          const challenge=await store.challenge(req.auth.jti);
          if(challenge.user_id!==String(user.id))return res.sendStatus(401);
        } catch(error) { if(error.code)throw error;return res.sendStatus(401); }
      } else if(sessions&&!await sessions.allowed(req.auth,false))return res.sendStatus(401);
      const required=needsMfa(user);
      res.json({required,verified:await store.allowed(user,req.auth),challenge:req.auth.purpose==='mfa',enrolled:!!await store.credential(user.id)});
    }catch(error){next(error);}
  });
  router.use(async(req,res,next)=>{
    try {
      if(req.auth.purpose!=='mfa'||typeof req.auth.jti!=='string')return res.status(403).json({message:'Sign in with your password before configuring or verifying Google Authenticator.'});
      const row=await store.challenge(req.auth.jti);
      if(row.user_id!==String(req.auth.sub))return res.sendStatus(403);
      const user=await resolveUser(row.user_id);
      if(!user||user.status!=='active')return res.sendStatus(403);
      req.mfaUser=user;next();
    }catch(error){res.status(401).json({message:'Verification expired or unavailable. Sign in again.'});}
  });
  router.post('/setup',async(req,res,next)=>{
    try {const setup=await store.setup(req.auth.jti);res.json({secret:setup.secret,qr:await QRCode.toDataURL(setup.uri,{width:240,margin:2})});}
    catch(error){next(error);}
  });
  router.post('/verify',async(req,res,next)=>{
    try {
      if(typeof req.body.code!=='string'||req.body.code.length>40)throw new Error('Enter the authenticator code or a recovery code.');
      const result=await store.verify(req.auth.jti,req.body.code.trim());
      const user=req.mfaUser;
      res.json({accessToken:await createAccessToken(user,{...result.claims,mfa:result.version,mfaAt:Date.now()},sessions),recoveryCodes:result.recoveryCodes,
        destination:user.roles?.includes('Platform Admin')?'/dashboard/platform-admin':user.roles?.some(r=>r.startsWith('Treasury '))?'/dashboard/treasury':user.roles?.includes('Tenant Staff')?'/dashboard/tenant':'/dashboard/member'});
    }catch(error){next(error);}
  });
  router.use((error,req,res,next)=>res.status(error.code?503:400).json({message:error.status===400?error.message:'Verification failed or is unavailable. Check your code or sign in again.'}));
  return router;
}
