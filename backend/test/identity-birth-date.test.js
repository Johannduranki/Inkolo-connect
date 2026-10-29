import test from 'node:test';
import assert from 'node:assert/strict';
import {identityBirthDate} from '../src/identity-birth-date.js';
import {registeredFuneralMember} from '../src/funeral-applications.js';
const now=new Date('2026-10-29T12:00:00Z');
// Generated synthetic identifiers; no real identity documents are used.
const idFor=date=>{const prefix=date+'000008';let sum=0;for(let i=0;i<12;i++){let d=Number(prefix[i]);if(i%2){d*=2;if(d>9)d-=9;}sum+=d;}return prefix+(10-sum%10)%10;};
test('extracts valid dates across centuries and leap days',()=>{
 for(const [encoded,expected] of [['900101','1990-01-01'],['050203','2005-02-03'],['000229','2000-02-29'],['261230','1926-12-30']])assert.equal(identityBirthDate(idFor(encoded),now),expected);
});
test('invalid IDs and impossible dates do not manufacture a birth date',()=>{
 for(const value of [null,123,'900101','abcdefghijklm',idFor('900231'),idFor('001301'),idFor('000000')])assert.equal(identityBirthDate(value,now),'');
 const valid=idFor('900101');assert.equal(identityBirthDate(valid.slice(0,12)+(Number(valid[12])+1)%10,now),'');
});
test('saved birth dates take priority and only the signed-in member ID is used',()=>{
 const state={users:[{id:'member',firstName:'Test',lastName:'Member'}],profiles:[{userId:'other',idNumber:idFor('900101')},{userId:'member',idNumber:idFor('050203')} ]};
 assert.equal(registeredFuneralMember(state,'member').dateOfBirth,'2005-02-03');
 state.profiles[1].dateOfBirth='1905-02-03';assert.equal(registeredFuneralMember(state,'member').dateOfBirth,'1905-02-03');
 assert.equal(registeredFuneralMember(state,'member').idNumber,undefined);
 assert.deepEqual(registeredFuneralMember(state,'missing'),{});
});
