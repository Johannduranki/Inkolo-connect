import test from 'node:test';
import assert from 'node:assert/strict';
import {activeMigrationFiles,applySchemaMigration} from '../src/schema-migration.js';

test('schema runner selects only canonical migrations, not archived SQL',()=>{
  assert.deepEqual(activeMigrationFiles(['002_add_membership.sql','001_create_users.pre-migration-123.sql','001_create_users.sql','duranki_existing_database_setup.sql','001_create_users.sql.bak','../001_escape.sql']),['001_create_users.sql','002_add_membership.sql']);
});
test('schema failure never writes an applied marker, including duplicate columns',async()=>{
  let marked=false;
  const connection={execute:async sql=>{if(sql.startsWith('INSERT'))marked=true;return [[]];},query:async()=>{throw Object.assign(Error('fixture'),{code:'ER_DUP_FIELDNAME'});}};
  await assert.rejects(applySchemaMigration(connection,'001_test.sql','ALTER TABLE fixture'),{code:'ER_DUP_FIELDNAME'});
  assert.equal(marked,false);
});
test('already applied migrations are not run again',async()=>{
  const connection={execute:async()=>[[{filename:'001_test.sql'}]],query:async()=>{throw Error('Must not run');}};
  assert.equal(await applySchemaMigration(connection,'001_test.sql','sql'),false);
});
