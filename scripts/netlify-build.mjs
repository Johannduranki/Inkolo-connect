import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const backendUrl = String(process.env.BACKEND_URL || '').replace(/\/$/, '');

if (!/^https:\/\//.test(backendUrl)) {
  throw new Error('BACKEND_URL must be the HTTPS address of the Railway API.');
}

const publicDirectory = path.resolve('frontend/public');
await mkdir(publicDirectory, { recursive: true });
await writeFile(
  path.join(publicDirectory, '_redirects'),
  [
    `/api/* ${backendUrl}/api/:splat 200`,
    `/uploads/* ${backendUrl}/uploads/:splat 200`,
    '/* /index.html 200',
    ''
  ].join('\n')
);

await run('npm', ['--prefix', 'frontend', 'ci']);
await run('npm', ['--prefix', 'frontend', 'run', 'build']);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
