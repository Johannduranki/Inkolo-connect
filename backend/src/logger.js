import 'dotenv/config';
import winston from 'winston';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// An allowlist avoids leaking request payloads, credentials, SQL or arbitrary error messages.
export function safeLog(info){
  const safe={level:info.level,message:/^[a-z][a-z0-9_]{0,79}$/.test(info.message)?info.message:'redacted_event',service:'duranki-api'};
  for(const key of ['status','durationMs','port'])if(Number.isFinite(info[key]))safe[key]=info[key];
  if(/^[0-9a-f-]{36}$/.test(info.requestId||''))safe.requestId=info.requestId;
  if(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(info.method))safe.method=info.method;
  if(typeof info.route==='string'&&/^\/[a-zA-Z0-9_/:*{}.-]{0,180}$/.test(info.route))safe.route=info.route;
  if(['Error','TypeError','RangeError','SyntaxError','MulterError'].includes(info.errorType))safe.errorType=info.errorType;
  if(typeof info.errorCode==='string'&&/^(E[A-Z_]{2,40}|ER_[A-Z_]{2,40}|LIMIT_[A-Z_]{2,40})$/.test(info.errorCode))safe.errorCode=info.errorCode;
  return safe;
}
export const errorDetails=error=>({errorType:error?.name,errorCode:error?.code});
export function createLogger({directory=process.env.LOG_DIRECTORY||fileURLToPath(new URL('../logs/',import.meta.url)),level=process.env.LOG_LEVEL||'info',transports}={}){
  const validLevel=Object.hasOwn(winston.config.npm.levels,level)?level:'info';
  if(!transports && process.env.LOG_DESTINATION==='stdout') transports=[new winston.transports.Console()];
  if(!transports){
    mkdirSync(directory,{recursive:true,mode:0o700});
    const fileOptions={maxsize:5*1024*1024,maxFiles:5,tailable:true,options:{flags:'a',mode:0o600}};
    transports=[new winston.transports.Console(),new winston.transports.File({...fileOptions,filename:path.join(directory,'application.log')}),new winston.transports.File({...fileOptions,filename:path.join(directory,'error.log'),level:'error'})];
  }
  const logger=winston.createLogger({level:validLevel,format:winston.format.combine(winston.format(info=>Object.assign(safeLog(info),{[Symbol.for('level')]:info[Symbol.for('level')]}))(),winston.format.timestamp(),winston.format.json()),transports});
  logger.on('error',()=>process.stderr.write('Duranki logging transport failed. Check log directory permissions and disk space.\n'));
  return logger;
}
export const logger=createLogger();
export function requestLogging(log=logger){
  return (req,res,next)=>{
    req.requestId=randomUUID();res.setHeader('X-Request-Id',req.requestId);
    const started=performance.now();let recorded=false;
    const record=()=>{if(recorded)return;recorded=true;const status=res.writableFinished?res.statusCode:499;
      log.log(status>=500?'error':status>=400?'warn':'info','http_request',{requestId:req.requestId,method:req.method,route:typeof req.route?.path==='string'?req.route.path:'/unmatched',status,durationMs:Math.round((performance.now()-started)*100)/100});};
    res.once('finish',record);res.once('close',record);next();
  };
}
export function installFatalLogging(log=logger){
  let exiting=false;
  const fatal=(event,error)=>{if(exiting)return;exiting=true;log.error(event,errorDetails(error));log.once('finish',()=>process.exit(1));log.end();setTimeout(()=>process.exit(1),2000).unref();};
  process.once('uncaughtException',error=>fatal('uncaught_exception',error));
  process.once('unhandledRejection',error=>fatal('unhandled_rejection',error));
}
