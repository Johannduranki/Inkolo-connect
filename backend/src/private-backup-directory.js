import {mkdirSync,chmodSync,lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

export function privateBackupDirectory(directory){
  const target=path.resolve(directory);
  mkdirSync(target,{recursive:true,mode:0o700});
  if(!lstatSync(target).isDirectory()||lstatSync(target).isSymbolicLink())throw Error('Backup directory must not be a symbolic link.');
  if(process.platform!=='win32'){chmodSync(target,0o700);return;}
  // Windows ignores POSIX modes. Apply inheritable permissions before copying secrets.
  const script=`$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($identity.User.Value,'S-1-5-18','S-1-5-32-544')){
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
[IO.Directory]::SetAccessControl($env:DURANKI_PRIVATE_BACKUP_DIRECTORY,$acl)`;
  execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'pipe',env:{...process.env,DURANKI_PRIVATE_BACKUP_DIRECTORY:target}});
}
