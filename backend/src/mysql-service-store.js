import {AsyncLocalStorage} from 'node:async_hooks';

// Each service serializes writes in SQL, including precondition checks and audit.
// Nested operations reuse the same connection and transaction.
export class MysqlServiceStore {
  constructor(pool,service){this.pool=pool;this.service=service;this.context=new AsyncLocalStorage();this.nativeSql=true;}
  async all(sql,...values){const [rows]=await (this.context.getStore()||this.pool).execute(sql,values);return rows;}
  async get(sql,...values){return (await this.all(sql,...values))[0];}
  async run(sql,...values){const [result]=await (this.context.getStore()||this.pool).execute(sql,values);return result;}
  async tx(work){
    if(this.context.getStore())return work();
    const c=await this.pool.getConnection();
    try{
      await c.beginTransaction();
      const [locks]=await c.execute('SELECT service FROM duranki_service_write_lock WHERE service=? FOR UPDATE',[this.service]);
      if(locks.length!==1)throw Error('Service write lock is not configured.');
      const result=await this.context.run(c,work);
      await c.commit();return result;
    }catch(error){await c.rollback().catch(()=>{});throw error;}finally{c.release();}
  }
  async ready(){
    const row=await this.get('SELECT service FROM duranki_service_migration WHERE service=?',this.service);
    const lock=await this.get('SELECT service FROM duranki_service_write_lock WHERE service=?',this.service);
    if(!row||!lock)throw Error('Service migration must be verified before activation.');
  }
}
