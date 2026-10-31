import {createHash} from 'node:crypto';

export const platformDigest = value => createHash('sha256').update(value).digest('hex');
const chunkSize = 256 * 1024;
const unavailable = () => Object.assign(Error('Platform storage is temporarily unavailable.'),{status:503,code:'PLATFORM_STORAGE_UNAVAILABLE'});
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export async function readSqlDocument(connection,id='platform') {
  const [[metadata]] = await connection.execute('SELECT * FROM duranki_platform_document WHERE id=?',[id]);
  if (!metadata) throw Error('Platform storage is not initialized. Run npm run migrate then npm run bootstrap.');
  const [chunks] = await connection.execute('SELECT chunk_index,payload FROM duranki_platform_chunk WHERE document_id=? ORDER BY chunk_index',[id]);
  if (chunks.length !== metadata.chunk_count || chunks.some((chunk,index)=>chunk.chunk_index!==index)) throw Error('Platform snapshot is incomplete.');
  const bytes = Buffer.concat(chunks.map(chunk=>chunk.payload));
  if (bytes.length !== Number(metadata.byte_length) || platformDigest(bytes)!==metadata.sha256) throw Error('Platform snapshot checksum mismatch.');
  return {state:JSON.parse(bytes.toString('utf8')),revision:Number(metadata.revision),sha256:metadata.sha256};
}

// Called inside the writer's transaction. Metadata and every chunk commit together.
export async function writeSqlDocument(connection,id,state,revision,expectedRevision) {
  const bytes = Buffer.from(JSON.stringify(state));
  const count = Math.ceil(bytes.length/chunkSize), sha256=platformDigest(bytes);
  if (expectedRevision === undefined) {
    await connection.execute('INSERT INTO duranki_platform_document(id,revision,sha256,chunk_count,byte_length,updated_at) VALUES(?,?,?,?,?,?)',[id,revision,sha256,count,bytes.length,new Date().toISOString()]);
  } else {
    const [result] = await connection.execute('UPDATE duranki_platform_document SET revision=?,sha256=?,chunk_count=?,byte_length=?,updated_at=? WHERE id=? AND revision=?',[revision,sha256,count,bytes.length,new Date().toISOString(),id,expectedRevision]);
    if (result.affectedRows!==1) throw Object.assign(Error('Platform revision conflict.'),{status:409,code:'PLATFORM_REVISION_CONFLICT'});
  }
  for(let index=0;index<count;index++) await connection.execute('INSERT INTO duranki_platform_chunk(document_id,chunk_index,payload) VALUES(?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[id,index,bytes.subarray(index*chunkSize,(index+1)*chunkSize)]);
  await connection.execute('DELETE FROM duranki_platform_chunk WHERE document_id=? AND chunk_index>=?',[id,count]);
}

export class MysqlPlatformStore {
  constructor(pool,id='platform',{heartbeatMs=30000}={}) {
    if (!Number.isInteger(heartbeatMs) || heartbeatMs<100) throw Error('Invalid storage heartbeat interval.');
    this.pool=pool;this.id=id;this.queue=Promise.resolve();this.healthy=false;this.heartbeatMs=heartbeatMs;this.closed=false;
  }
  async open() {
    await this.connect();
    this.timer=setInterval(()=>{this.maintain().catch(()=>{});},this.heartbeatMs);
    this.timer.unref?.();
  }
  discard() {
    this.healthy=false;
    const previous=this.connection;this.connection=undefined;
    previous?.destroy();
  }
  async connect() {
    if(this.closed)throw unavailable();
    this.discard();
    const c = this.connection = await this.pool.getConnection();
    const lost=()=>{if(this.connection===c)this.healthy=false;};
    c.on('error',lost);
    c.on('end',lost);
    try {
      const [[database]] = await c.query('SELECT DATABASE() AS name');
      this.lockName='duranki-platform-'+platformDigest(`${database.name}:${this.id}`).slice(0,40);
      const [[lock]] = await c.execute('SELECT GET_LOCK(?,0) AS acquired',[this.lockName]);
      if (Number(lock.acquired)!==1) throw Object.assign(Error('Another platform writer is active.'), {code:'ER_DURANKI_WRITER_ACTIVE'});
      if(this.id==='platform'){
        const [[migration]]=await c.query('SELECT id FROM duranki_platform_migration WHERE id=1');
        if(!migration)throw Error('Platform storage is not initialized. Run npm run bootstrap.');
      }
      await c.beginTransaction();
      const loaded = await readSqlDocument(c,this.id);
      await c.commit();
      if(this.closed)throw unavailable();
      this.state=freeze(loaded.state);this.revision=loaded.revision;this.healthy=true;
    } catch(error) { this.discard();throw error; }
  }
  async checkConnection() {
    try {
      const [[lock]]=await this.connection.execute('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned',[this.lockName]);
      if(Number(lock.owned)!==1)throw unavailable();
    } catch(error) {this.discard();throw error;}
  }
  maintain() {
    if(this.closed)return Promise.resolve();
    if(this.maintenance)return this.maintenance;
    const work=this.queue.then(async()=>{
      if(this.closed)return;
      if(this.healthy)await this.checkConnection().catch(()=>{});
      if(!this.healthy)await this.connect();
    });
    this.queue=work.catch(()=>{});this.maintenance=work;
    work.then(()=>{this.maintenance=undefined;},()=>{this.maintenance=undefined;});
    return work;
  }
  read() {
    if (!this.healthy) {this.maintain().catch(()=>{});throw unavailable();}
    return this.state;
  }
  update(mutator) {
    const work = this.queue.then(async()=>{
      if(this.closed)throw unavailable();
      if(!this.healthy)await this.connect();
      await this.checkConnection();
      const draft=structuredClone(this.state);
      const result=mutator(draft);
      if (result && typeof result.then==='function') throw Error('Platform mutations must be synchronous.');
      const c=this.connection;
      let committing=false;
      await c.beginTransaction();
      try {
        await writeSqlDocument(c,this.id,draft,this.revision+1,this.revision);
        committing=true;
        await c.commit();
        this.state=freeze(draft);this.revision++;
        return structuredClone(result);
      } catch(error) {
        await c.rollback().catch(()=>{});
        // A lost commit response cannot be retried against a possibly stale cache.
        if (committing || error.code==='PLATFORM_REVISION_CONFLICT') this.healthy=false;
        throw error;
      }
    });
    this.queue=work.catch(()=>{});
    return work;
  }
  async close() {
    this.closed=true;
    clearInterval(this.timer);
    await this.queue;
    this.healthy=false;
    if(this.connection){
      await this.connection.execute('SELECT RELEASE_LOCK(?)',[this.lockName]).catch(()=>{});
      this.connection.destroy();
    }
  }
}
