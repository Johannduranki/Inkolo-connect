# Run elevated on this local Windows installation only. Never resets root or imports data.
param([switch]$PrepareMigrationSchema,[switch]$PrepareAuthSchema,[switch]$PrepareTreasurySchema,[switch]$PreparePlatformSchema,[switch]$PrepareTrainingSchema,[switch]$PrepareServiceSchemas)
$ErrorActionPreference = 'Stop'
$schemaOnly = $PrepareAuthSchema -or $PrepareTreasurySchema -or $PreparePlatformSchema -or $PrepareTrainingSchema -or $PrepareServiceSchemas
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$report = Join-Path $root '.runlogs/mariadb-recovery.json'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Windows administrator approval is required.' }
$data = 'C:\Program Files\MariaDB 10.11\data'
$ini = Join-Path $data 'my.ini'
$envFile = Join-Path $root 'backend/.env'
$originalIni = [IO.File]::ReadAllBytes($ini)
$originalEnv = [IO.File]::ReadAllText($envFile)
$dbMatch = [regex]::Match($originalEnv, '(?m)^DB_NAME=([a-zA-Z0-9_]+)\s*$')
if (-not $dbMatch.Success) { throw 'Expected a simple DB_NAME in backend/.env.' }
$database = $dbMatch.Groups[1].Value.Trim()
$service = Get-CimInstance Win32_Service -Filter "Name='MariaDB'"
if ($service.PathName -notlike '*MariaDB 10.11*' -or $service.PathName -notlike '*my.ini*') { throw 'Unexpected MariaDB service configuration.' }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')
$backup = Join-Path $root "backend/data/backups/mariadb-cold-$stamp"
New-Item -ItemType Directory -Path $backup | Out-Null
# Backups include database authentication tables; restrict Windows ACLs before copying.
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($identity.User.Value, 'S-1-5-18', 'S-1-5-32-544')) {
  $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $backup -AclObject $acl
$init = Join-Path $data "duranki-one-time-$stamp.sql"
$changedIni = $false
$verified = $false
$result = @{status='running';backup=$backup}
$result | ConvertTo-Json | Set-Content -LiteralPath $report
try {
  Stop-Service -Name MariaDB
  (Get-Service MariaDB).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
  $files = Get-ChildItem -LiteralPath $data -Recurse -File
  if (Get-ChildItem -LiteralPath $data -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Database backup refuses reparse points.' }
  $manifest = foreach ($file in $files) {
    $relative = $file.FullName.Substring($data.Length).TrimStart('\')
    $target = Join-Path $backup "data/$relative"
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    if ($hash -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw 'Cold backup verification failed.' }
    @{file=$relative;sha256=$hash;bytes=$file.Length}
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json')
  $verified = $true
  $username = 'duranki_' + ([Guid]::NewGuid().ToString('N').Substring(0,12))
  $bytes = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $password = [Convert]::ToBase64String($bytes)
  $sql = @("CREATE DATABASE IF NOT EXISTS ``$database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
  if ($PrepareMigrationSchema) {
    $sql += "USE ``$database``;"
    $sql += Get-Content -LiteralPath (Join-Path $root 'backend/database/017_local_migration_staging.sql') | Where-Object { $_.Trim() }
  }
  if ($PrepareAuthSchema) {
    $sql += "USE ``$database``;"
    $sql += Get-Content -LiteralPath (Join-Path $root 'backend/database/018_native_auth_storage.sql') | Where-Object { $_.Trim() }
  }
  if ($PrepareTreasurySchema) {
    $sql += "USE ``$database``;"
    $sql += Get-Content -LiteralPath (Join-Path $root 'backend/database/019_native_treasury_storage.sql') | Where-Object { $_.Trim() }
  }
  if ($PreparePlatformSchema) {
    $sql += "USE ``$database``;"
    $sql += Get-Content -LiteralPath (Join-Path $root 'backend/database/020_platform_document_storage.sql') | Where-Object { $_.Trim() }
  }
  if ($PrepareTrainingSchema) {
    $sql += "USE ``$database``;"
    $sql += Get-Content -LiteralPath (Join-Path $root 'backend/database/021_native_training_storage.sql') | Where-Object { $_.Trim() }
  }
  if ($PrepareServiceSchemas) {
    $sql += "USE ``$database``;"
    $sql += Get-Content -LiteralPath (Join-Path $root 'backend/database/022_native_cycle_storage.sql') | Where-Object { $_.Trim() }
    $sql += Get-Content -LiteralPath (Join-Path $root 'backend/database/023_native_heritage_storage.sql') | Where-Object { $_.Trim() }
  }
  if (-not $schemaOnly) {
    $sql += foreach ($hostName in @('localhost','127.0.0.1')) {
      "CREATE USER '$username'@'$hostName' IDENTIFIED BY '$password';"
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ``$database``.* TO '$username'@'$hostName';"
    }
  }
  # Create empty, set file-only permissions, then write credentials. Backup ACLs stay private.
  [IO.File]::WriteAllText($init, '')
  $fileAcl = [Security.AccessControl.FileSecurity]::new()
  $fileAcl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($identity.User.Value, 'S-1-5-18', 'S-1-5-32-544')) {
    $fileAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid), 'FullControl', 'Allow'))
  }
  $fileAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.NTAccount]::new($service.StartName), 'Read', 'Allow'))
  Set-Acl -LiteralPath $init -AclObject $fileAcl
  [IO.File]::WriteAllLines($init, $sql, [Text.UTF8Encoding]::new($false))
  $initPath = $init.Replace('\','/')
  $changedIni = $true
  [IO.File]::AppendAllText($ini, "`r`n[mysqld]`r`ninit-file=$initPath`r`n", [Text.UTF8Encoding]::new($false))
  Start-Service MariaDB
  (Get-Service MariaDB).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
  # Pass credentials through the child environment, never through command-line arguments.
  if (-not $schemaOnly) {
    $env:DB_HOST='127.0.0.1'; $env:DB_PORT='3306'; $env:DB_USER=$username; $env:DB_PASSWORD=$password; $env:DB_NAME=$database
  }
  Push-Location (Join-Path $root 'backend')
  try {
    & 'C:\Program Files\nodejs\node.exe' scripts/probe-mariadb.js --server-only
    if ($LASTEXITCODE -ne 0) { throw 'Application account verification failed.' }
  } finally { Pop-Location }
  # Keep the authoritative local store selected until a separately reviewed migration.
  $updated = $originalEnv
  foreach ($entry in @(@('DB_HOST','127.0.0.1'),@('DB_PORT','3306'),@('DB_USER',$username),@('DB_PASSWORD',$password),@('FORCE_DEMO_MODE','true'))) {
    $pattern = '(?m)^' + $entry[0] + '=.*$'
    $line = $entry[0] + '=' + $entry[1]
    if ([regex]::IsMatch($updated,$pattern)) { $updated = [regex]::Replace($updated,$pattern,[Text.RegularExpressions.MatchEvaluator]{param($m) $line}) }
    else { $updated += "`r`n$line`r`n" }
  }
  if (-not $schemaOnly) { [IO.File]::WriteAllText($envFile, $updated, [Text.UTF8Encoding]::new($false)) }
  $result = @{status=$(if($schemaOnly){'schema-prepared'}else{'credentials-recovered'});backup=$backup;backupVerified=$verified;database=$database;storage='unchanged'}
} catch {
  $result = @{status='failed';backup=$backup;backupVerified=$verified;errorType=$_.Exception.GetType().Name}
} finally {
  try {
    if ($changedIni) {
      Stop-Service MariaDB
      (Get-Service MariaDB).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
      [IO.File]::WriteAllBytes($ini,$originalIni)
    }
    if (Test-Path -LiteralPath $init) { Remove-Item -LiteralPath $init }
    if ((Get-Service MariaDB).Status -ne 'Running') { Start-Service MariaDB }
    $result.service = (Get-Service MariaDB).Status.ToString()
  } catch { $result.status='operator-attention-required'; $result.configurationRestoreRequired=$true }
  $result | ConvertTo-Json | Set-Content -LiteralPath $report
}
