import {getPool} from '../src/database.js';
import {readSqlDocument} from '../src/mysql-platform-store.js';
import {MysqlTrainingStore} from '../src/mysql-training-store.js';
import {trainingCommunities} from '../src/trader-training.js';

const pool=getPool();
try{
  const {state}=await readSqlDocument(pool);
  const store=new MysqlTrainingStore(pool);
  await store.ready();
  const existing=new Set((await store.list()).map(programme=>programme.community_id));
  for(const community of trainingCommunities(state)){
    if(existing.has(community.id))continue;
    await store.create(community,'system:requested-trader-training-setup');
    existing.add(community.id);
    console.log('Created an unfunded Trader Connect draft.');
  }
}catch{
  console.error('MariaDB training initialization failed. Check schema readiness and database configuration.');
  process.exitCode=1;
}finally{await pool.end();}
