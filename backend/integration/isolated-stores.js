import mysql from 'mysql2/promise';
import { randomBytes, createHash } from 'node:crypto';

export function integrationDatabaseConfig(env=process.env) {
  const port=Number(env.DB_PORT || 3306);
  if (env.MARIADB_INTEGRATION_TEST !== '1' || env.NODE_ENV === 'production' ||
      !['127.0.0.1','::1','localhost'].includes(env.DB_HOST) ||
      !/^(?:[A-Za-z0-9_]+_test|duranki_test[A-Za-z0-9_]*)$/.test(env.DB_NAME || '') ||
      !env.DB_USER?.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error('Integration fixtures require MARIADB_INTEGRATION_TEST=1, a loopback host, a test-named database, valid connection settings and non-production mode.');
  }
  return {host:env.DB_HOST,port,user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,connectionLimit:4};
}

// Clone constraints as well as columns. Every query is routed to this fixture's
// tables, so concurrent HTTP tests keep using the untouched bootstrap tables.
export async function isolatedStore(t, Store, service) {
  const pool=mysql.createPool(integrationDatabaseConfig());
  const prefix='it_'+randomBytes(6).toString('hex')+'_';
  const patterns={cycle:/^cycle_/,heritage:/^heritage_/,training:/^duranki_training_/,treasury:/^duranki_treasury_/};
  const [rows]=await pool.query('SHOW TABLES');
  const tables=rows.map(row=>Object.values(row)[0]).filter(name=>patterns[service].test(name));
  if (!tables.length) {await pool.end();throw Error('Bootstrap tables are missing for '+service);}
  const names=new Map(tables.map(name=>[name,prefix+name]));
  const replace=sql=>sql.replace(/\b(?:duranki_(?:training|treasury)_\w+|cycle_\w+|heritage_\w+)\b/g,name=>names.get(name)||name);
  const created=[];
  t.after(async()=>{
    const c=await pool.getConnection();
    try{await c.query('SET FOREIGN_KEY_CHECKS=0');for(const name of created.reverse()){
      if(!name.startsWith(prefix)||!/^it_[a-f0-9]{12}_[a-z_]+$/.test(name))throw Error('Unexpected cleanup table');
      await c.query('DROP TABLE IF EXISTS `'+name+'`');
    }}finally{await c.query('SET FOREIGN_KEY_CHECKS=1');c.release();await pool.end();}
  });
  const c=await pool.getConnection();
  try{
    await c.query('SET FOREIGN_KEY_CHECKS=0');
    for(const name of tables){
      const [[definition]]=await c.query('SHOW CREATE TABLE `'+name+'`');
      let ddl=replace(definition['Create Table']);
      ddl=ddl.replace(/CONSTRAINT `([^`]+)`/g,(_match,constraint)=>'CONSTRAINT `'+prefix+createHash('sha256').update(constraint).digest('hex').slice(0,24)+'`');
      await c.query(ddl);created.push(names.get(name));
    }
  }finally{await c.query('SET FOREIGN_KEY_CHECKS=1');c.release();}
  const wrap=connection=>({execute:(sql,args)=>connection.execute(replace(sql),args),query:(sql,args)=>connection.query(replace(sql),args),beginTransaction:()=>connection.beginTransaction(),commit:()=>connection.commit(),rollback:()=>connection.rollback(),release:()=>connection.release()});
  const routed={...wrap(pool),getConnection:async()=>wrap(await pool.getConnection())};
  if(service==='heritage')await routed.execute("INSERT INTO heritage_catalogue VALUES('duranki-heritage','Duranki Heritage / Family Tree')");
  const store=new Store(routed);
  // Explicit test setup/query boundary, not a production storage fallback.
  store.fixtureQuery=async(sql,...values)=>(await routed.execute(sql,values))[0];
  return store;
}
