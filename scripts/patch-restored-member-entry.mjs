import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const file=new URL('../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url);
const source=readFileSync(file,'utf8');
const before='this.communityServiceEntry.set(this.returnToCommunityOnClose&&!!this.requestedServiceCode)';
const after='this.communityServiceEntry.set(false)';
assert.equal(source.split(before).length-1,1,'Expected restored member-entry expression exactly once');
writeFileSync(file,source.replace(before,after));
console.log('Patched only the restored community background-frame toggle.');
