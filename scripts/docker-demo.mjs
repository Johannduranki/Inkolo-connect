import {spawnSync} from 'node:child_process';
import {realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));

export function localComposeCommand(args, inherited=process.env) {
  if(args.length && (args.length!==2 || args[0]!=='--env-file')) {
    throw Error('Usage: npm start -- --env-file <private-file-outside-repository>');
  }
  const supplied=args[1] || inherited.DURANKI_ENV_FILE;
  if(!supplied)throw Error('Provide --env-file or DURANKI_ENV_FILE. No database or secret defaults are supplied.');
  const envFile=realpathSync(supplied);
  if(!statSync(envFile).isFile())throw Error('The private environment path must be a file.');
  const relative=path.relative(realpathSync(root),envFile);
  if(!path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep)) {
    throw Error('Keep the private environment file outside the repository.');
  }
  const env={...inherited};
  // Compose shell values override --env-file; keep unrelated host secrets out of this stack.
  for(const key of Object.keys(env)) {
    if(/^(DB_|MYSQL_|MARIADB_|COMPOSE_)/.test(key) || ['ID_PEPPER','JWT_SECRET','MFA_ENCRYPTION_KEY','LOCAL_PORT'].includes(key))delete env[key];
  }
  return {command:'docker',args:['compose','--env-file',envFile,'-f',path.join(root,'compose.local.yml'),'up','--build','-d'],options:{cwd:root,env,stdio:'inherit',windowsHide:true}};
}

export function runLocalCompose(invocation, run=spawnSync) {
  const prefix=invocation.args.slice(0,-3);
  // Validate and build before interrupting the writer. Bootstrap must run with
  // the old API stopped, even when Compose considers its image unchanged.
  for(const args of [['config','--quiet'],['build'],['stop','app'],['up','--no-build','-d']]) {
    const result=run(invocation.command,[...prefix,...args],invocation.options);
    if(result.error)throw Error('Docker Compose could not start. Check that Docker is installed and running.');
    if(result.status!==0)return result.status ?? 1;
  }
  return 0;
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const invocation=localComposeCommand(process.argv.slice(2));
    process.exitCode=runLocalCompose(invocation);
  } catch(error) {
    console.error(error.code ? 'Private environment file is missing or unreadable.' : error.message);
    process.exitCode=1;
  }
}
