import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const blocked=files.filter(p=>/^(backend\/data\/|backend\/uploads\/|uploads\/|\.runlogs\/|USER_LOGINS_README)/i.test(p)||/(^|\/)\.env$/i.test(p)||/\.(sqlite(?:-wal|-shm)?|pem|key)$/i.test(p));
if(blocked.length){
  console.error('Release blocked: private runtime files are tracked by Git. Review and remove them from tracking, not from the local disk. Rotate any exposed secrets.');
  console.error(blocked.join('\n'));process.exit(1);
}
console.log('Release file preflight passed. This does not replace secret scanning or a production readiness review.');
