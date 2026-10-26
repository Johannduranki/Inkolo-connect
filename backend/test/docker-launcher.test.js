import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,realpathSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {localComposeCommand,runLocalCompose} from '../../scripts/docker-demo.mjs';

test('local restart builds before stopping its writer and then initializes the stack',()=>{
  const calls=[];
  const invocation={command:'docker',args:['compose','-f','local.yml','up','--build','-d'],options:{}};
  assert.equal(runLocalCompose(invocation,(_command,args)=>{calls.push(args.slice(3));return {status:0};}),0);
  assert.deepEqual(calls,[['config','--quiet'],['build'],['stop','app'],['up','--no-build','-d']]);
});

test('a failed build never stops the running API',()=>{
  const calls=[];
  const invocation={command:'docker',args:['compose','-f','local.yml','up','--build','-d'],options:{}};
  assert.equal(runLocalCompose(invocation,(_command,args)=>{calls.push(args.slice(3));return {status:calls.length===2?1:0};}),1);
  assert.deepEqual(calls,[['config','--quiet'],['build']]);
});

test('local launcher requires an explicit private file and refuses repository files',()=>{
  assert.throws(()=>localComposeCommand([],{}),/No database or secret defaults/);
  assert.throws(()=>localComposeCommand(['--unknown'],{}),/Usage/);
  assert.throws(()=>localComposeCommand(['--env-file',fileURLToPath(new URL('../../package.json',import.meta.url))],{}),/outside the repository/);
});

test('local launcher pins Compose and isolates inherited database settings',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'duranki-launcher-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const file=path.join(directory,'synthetic.env');
  writeFileSync(file,'DB_NAME=synthetic_only\n');
  const inherited={DURANKI_ENV_FILE:file,DB_HOST:'unrelated-host',DB_PASSWORD:'not-used',JWT_SECRET:'not-used',MFA_ENCRYPTION_KEY:'not-used',COMPOSE_PROJECT_NAME:'unrelated-project',PATH:'tools'};
  const result=localComposeCommand([],inherited);
  assert.equal(result.command,'docker');
  assert.deepEqual(result.args.slice(0,4),['compose','--env-file',realpathSync(file),'-f']);
  assert.equal(path.basename(result.args[4]),'compose.local.yml');
  assert.deepEqual(result.args.slice(5),['up','--build','-d']);
  for(const name of ['DB_HOST','DB_PASSWORD','JWT_SECRET','MFA_ENCRYPTION_KEY','COMPOSE_PROJECT_NAME'])assert.equal(result.options.env[name],undefined);
  assert.equal(result.options.env.PATH,'tools');
  assert.equal(inherited.DB_HOST,'unrelated-host');
});

test('root startup aliases and Windows launcher use the same Docker entry point',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  for(const name of ['start','start:backend','start:frontend'])assert.equal(manifest.scripts[name],'node scripts/docker-demo.mjs');
  const command=readFileSync(new URL('../../start-demo.cmd',import.meta.url),'utf8');
  assert.match(command,/node scripts\\docker-demo\.mjs %\*/);
  assert.doesNotMatch(command,/ALLOW_DEMO_AUTH|FORCE_DEMO_MODE|JWT_SECRET/);
});
