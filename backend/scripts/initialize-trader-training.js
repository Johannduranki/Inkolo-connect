import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {TrainingStore,trainingCommunities} from '../src/trader-training.js';
const state=JSON.parse(readFileSync(new URL('../data/platform-store.json',import.meta.url),'utf8'));
const store=new TrainingStore(fileURLToPath(new URL('../data/trader-training.sqlite',import.meta.url)));
try{
  for(const community of trainingCommunities(state)){
    if(store.list().some(p=>p.community_id===community.id))continue;
    store.create(community,'system:requested-trader-training-setup');
    console.log('Created unfunded draft for '+community.name+' under Trader Connect.');
  }
}finally{store.db.close();}
