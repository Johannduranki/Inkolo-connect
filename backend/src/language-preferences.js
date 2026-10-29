import express from 'express';
export const supportedLanguages=['en','zu'];
export function saveLanguage(state,userId,language){
 if(!supportedLanguages.includes(language))throw Object.assign(Error('Choose English or isiZulu.'),{status:400});
 const records=state.languagePreferences??=[];
 let record=records.find(r=>r.userId===String(userId));
 if(!record){record={userId:String(userId)};records.push(record);}
 record.language=language;record.updatedAt=new Date().toISOString();return {language};
}
export function readLanguage(state,userId){const value=state.languagePreferences?.find(r=>r.userId===String(userId))?.language;return {language:supportedLanguages.includes(value)?value:'en'};}
export function createLanguageRouter({requireAuth,resolveUser,readState,updateState}){
 const router=express.Router();router.use(requireAuth);
 router.use(async(req,res,next)=>{try{res.set('Cache-Control','no-store');if((await resolveUser(req.auth.sub))?.status!=='active')return res.status(403).json({message:'Account unavailable.'});next();}catch(e){next(e);}});
 router.get('/',(req,res,next)=>{try{res.json(readLanguage(readState(),req.auth.sub));}catch(e){next(e);}});
 router.put('/',async(req,res,next)=>{try{res.json(await updateState(s=>saveLanguage(s,req.auth.sub,req.body?.language)));}catch(e){next(e);}});
 router.use((e,req,res,next)=>e.status?res.status(e.status).json({message:e.message}):next(e));return router;
}
