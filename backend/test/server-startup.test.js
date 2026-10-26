import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Execute the real entry point with isolated dependencies: no database, files,
// sockets or application services are started by these regression tests.
function startup(scenario) {
  const harness = `
    import vm from 'node:vm';
    import {readFileSync} from 'node:fs';
    const events=[];
    const scenario=${JSON.stringify(scenario)};
    const config={port:3001,allowDemoAuth:scenario==='format-error',forceDemoMode:false};
    const pool={query:async sql=>{
      events.push(sql);
      if(scenario==='connection-error')throw Object.assign(new Error('private'),{code:'ECONNREFUSED'});
      if(sql!=='SELECT 1')throw Error('Unexpected migration/data query');
      return [[{1:1}]];
    }};
    const modules={
      './config.js':{getConfig:()=>config},
      './database.js':{getPool:()=>pool,verifyDatabase:()=>pool.query('SELECT 1')},
      './account-storage.js':{selectAccountStorage:async()=> {
        if(scenario==='format-error')throw Object.assign(Error('private'),{code:'ACCOUNT_STORAGE_AMBIGUOUS'});
        return 'relational';
      }},
      './startup-port.js':{assertPortAvailable:async()=>events.push('port-checked')},
      './logger.js':{
        installFatalLogging:()=>{},
        errorDetails:e=>({errorCode:e.code}),
        logger:{info:()=>{},warn:()=>{},error:(name,details)=>events.push([name,details.errorCode]),once:()=>{},end:()=>events.push('log-ended')}
      },
      './app.js':{createApp:({databaseAvailable})=>{
        events.push(['create',databaseAvailable]);
        return {locals:{storageReady:Promise.resolve().then(()=>{
          if(scenario==='store-error')throw Object.assign(new Error('private'),{code:'ER_STORE_NOT_READY'});
          events.push('stores-ready');
        })},listen:()=>events.push('listening')};
      }}
    };
    const link=specifier=>{
      const exports=modules[specifier];
      if(!exports)throw Error('Unexpected startup dependency: '+specifier);
      return new vm.SyntheticModule(Object.keys(exports),function(){
        for(const [key,value] of Object.entries(exports))this.setExport(key,value);
      });
    };
    const entry=new vm.SourceTextModule(readFileSync(new URL('./src/server.js',import.meta.url),'utf8'),{
      importModuleDynamically:async specifier=>{const module=link(specifier);await module.link(link);await module.evaluate();return module;}
    });
    await entry.link(link);
    await entry.evaluate();
    await new Promise(resolve=>setImmediate(resolve));
    console.log(JSON.stringify({events,exitCode:process.exitCode||0}));
    process.exitCode=0;
  `;
  const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',harness],{
    cwd:new URL('../',import.meta.url),encoding:'utf8'
  });
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

test('existing database starts without a local-file or migration audit and waits for stores',()=>{
  const result=startup('ready');
  assert.deepEqual(result.events,['port-checked','SELECT 1',['create',true],'stores-ready','listening']);
  assert.equal(result.exitCode,0);
});

test('database connection failures still prevent listening without demo fallback',()=>{
  const result=startup('connection-error');
  assert.deepEqual(result.events,['port-checked','SELECT 1',['api_startup_failed','ECONNREFUSED'],'log-ended']);
  assert.equal(result.exitCode,1);
});

test('configured storage readiness failures still prevent listening',()=>{
  const result=startup('store-error');
  assert.deepEqual(result.events,['port-checked','SELECT 1',['create',true],['api_startup_failed','ER_STORE_NOT_READY'],'log-ended']);
  assert.equal(result.exitCode,1);
});

test('an account format failure never falls back to demo authentication',()=>{
  const result=startup('format-error');
  assert.deepEqual(result.events,['port-checked','SELECT 1',['api_startup_failed','ACCOUNT_STORAGE_AMBIGUOUS'],'log-ended']);
  assert.equal(result.exitCode,1);
});
