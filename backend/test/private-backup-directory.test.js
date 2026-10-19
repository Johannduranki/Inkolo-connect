import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,statSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {privateBackupDirectory} from '../src/private-backup-directory.js';

test('backup directories restrict access before confidential files are copied',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'duranki-backup-acl-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  writeFileSync(path.join(directory,'existing.txt'),'synthetic');
  privateBackupDirectory(directory);writeFileSync(path.join(directory,'synthetic.txt'),'synthetic');
  if(process.platform==='win32'){
    const script=`$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach($p in @($env:DURANKI_PRIVATE_BACKUP_DIRECTORY,(Join-Path $env:DURANKI_PRIVATE_BACKUP_DIRECTORY 'synthetic.txt'),(Join-Path $env:DURANKI_PRIVATE_BACKUP_DIRECTORY 'existing.txt'))){
  $acl=if([IO.Directory]::Exists($p)){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)}
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
    if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')){throw 'Unexpected backup access'}
  }
}`;
    assert.doesNotThrow(()=>execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'pipe',env:{...process.env,DURANKI_PRIVATE_BACKUP_DIRECTORY:directory}}));
  }else assert.equal(statSync(directory).mode&0o777,0o700);
});
