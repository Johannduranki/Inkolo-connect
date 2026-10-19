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
  if (!metadata) throw Error('A verified platform migration is required.');
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
  constructor(pool,id='platform') { this.pool=pool;this.id=id;this.queue=Promise.resolve();this.healthy=false; }
  async open() {
    const c = this.connection = await this.pool.getConnection();
    c.on('error',()=>{this.healthy=false;});
    c.on('end',()=>{this.healthy=false;});
    try {
      const [[database]] = await c.query('SELECT DATABASE() AS name');
      this.lockName='duranki-platform-'+platformDigest(`${database.name}:${this.id}`).slice(0,40);
      const [[lock]] = await c.execute('SELECT GET_LOCK(?,0) AS acquired',[this.lockName]);
      if (Number(lock.acquired)!==1) throw Error('Another platform writer is active.');
      if(this.id==='platform'){
        const [[migration]]=await c.query('SELECT id FROM duranki_platform_migration WHERE id=1');
        if(!migration)throw Error('Platform migration is not verified.');
      }
      const loaded = await readSqlDocument(c,this.id);
      this.state=freeze(loaded.state);this.revision=loaded.revision;this.healthy=true;
    } catch(error) { c.destroy();throw error; }
  }
  read() {
    if (!this.healthy) throw unavailable();
    return this.state;
  }
  update(mutator) {
    const work = this.queue.then(async()=>{
      this.read();
      const draft=structuredClone(this.state);
      const result=mutator(draft);
      if (result && typeof result.then==='function') throw Error('Platform mutations must be synchronous.');
      const c=this.connection;
      const [[lock]] = await c.execute('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned',[this.lockName]);
      if (Number(lock.owned)!==1) {this.healthy=false;throw unavailable();}
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
    await this.queue;
    this.healthy=false;
    if(this.connection){
      await this.connection.execute('SELECT RELEASE_LOCK(?)',[this.lockName]).catch(()=>{});
      this.connection.destroy();
    }
  }
}
