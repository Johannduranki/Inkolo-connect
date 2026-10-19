import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationDetails, ensureRegistrationStorage, saveSqlRegistrationDetails, savePlatformRegistrationDetails } from '../src/registration-details.js';

const body = { privacyAccepted: 'true', idNumber: '9001015009087', dateOfBirth: '1990-01-01', gender: 'Female' };
const buffer = Buffer.from('%PDF-1.4\nsynthetic document only');
const file = { buffer, size: buffer.length, mimetype: 'application/pdf', originalname: 'test.pdf' };
test('existing SQL storage needs no DDL; absent storage fails safely without account writes', async () => {
  const calls=[];
  await ensureRegistrationStorage({query:async sql=>{calls.push(sql);}});
  assert.equal(calls.length,1);assert.match(calls[0],/^SELECT/);
  await assert.rejects(ensureRegistrationStorage({query:async sql=>{
    if(sql.startsWith('SELECT'))throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});
    assert.match(sql,/^CREATE TABLE IF NOT EXISTS/);throw Error('no CREATE privilege');
  }}),{status:503});
});
test('registration preserves identity, consent evidence and document digest without trusting a verified flag', () => {
  const details = registrationDetails({...body, verificationMethod:'VERIFIED'}, file, new Date('2026-10-19T00:00:00Z'));
  assert.equal(details.idNumber, body.idNumber);
  assert.equal(details.dateOfBirth, body.dateOfBirth);
  assert.equal(details.gender, body.gender);
  assert.equal(details.verificationMethod, 'ID_UPLOAD_PENDING_REVIEW');
  assert.equal(details.privacy.acceptedAt, '2026-10-19T00:00:00.000Z');
  assert.match(details.privacy.policySha256, /^[a-f0-9]{64}$/);
  assert.match(details.document.sha256, /^[a-f0-9]{64}$/);
});
test('invalid dates, malformed IDs, missing consent and disguised or oversized documents are rejected', () => {
  for (const changes of [{privacyAccepted:false},{idNumber:'123'},{dateOfBirth:'2026-02-30'},{dateOfBirth:'9999-01-01'},{gender:{} }]) {
    assert.throws(() => registrationDetails({...body,...changes},file), {status:400});
  }
  for (const changes of [{size:6*1024*1024},{buffer:Buffer.from('<script>bad</script>')},{mimetype:'text/html'}]) {
    assert.throws(() => registrationDetails(body,{...file,...changes}), {status:400});
  }
  assert.equal(registrationDetails(body).verificationMethod,'MANUAL');
});
test('SQL writes complete details and original bytes on the supplied account transaction', async () => {
  const calls=[]; const connection={execute:async (...args)=>calls.push(args)};
  const details=registrationDetails(body,file);
  await saveSqlRegistrationDetails(connection,42,details,file);
  assert.match(calls[0][0],/^INSERT INTO member_registration_details/);
  assert.equal(calls[0][1][0],42);
  assert.deepEqual(JSON.parse(calls[0][1][1]),details);
  assert.deepEqual(calls[0][1][2],buffer);
  await assert.rejects(saveSqlRegistrationDetails({execute:async()=>{throw Error('disk failure');}},42,details,file), /disk failure/);
});
test('platform storage roundtrip preserves bytes and leaves previous records unchanged', () => {
  const existing={userId:1,details:{legacy:true}};
  const state={registrationDetails:[existing]},details=registrationDetails(body,file);
  savePlatformRegistrationDetails(state,42,details,file);
  const restored=JSON.parse(JSON.stringify(state));
  assert.deepEqual(restored.registrationDetails[0],existing);
  assert.deepEqual(restored.registrationDetails[1].details,details);
  assert.deepEqual(Buffer.from(restored.registrationDetails[1].documentBase64,'base64'),buffer);
});
