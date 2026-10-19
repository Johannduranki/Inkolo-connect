import mysql from '../backend/node_modules/mysql2/promise.js';
if(process.env.ALLOW_DEMO_AUTH==='true'||process.env.FORCE_DEMO_MODE==='true')throw new Error('Production must not fall back to demo storage.');
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:5000});
try{await db.query('SELECT 1');}finally{await db.end();}
const origin='http://127.0.0.1:'+Number(process.env.PORT||3000);
const health=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(4000)});
if(!health.ok||(await health.json()).storage!=='mariadb')throw new Error('Production API is not ready.');
const page=await fetch(origin+'/login',{signal:AbortSignal.timeout(4000)});
if(!page.ok||!(await page.text()).includes('<app-root'))throw new Error('Frontend is not available.');
