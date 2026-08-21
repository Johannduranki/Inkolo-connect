import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'frontend', 'dist', 'duranki-login', 'browser');
const indexFile = path.join(publicDir, 'index.html');
const vumaAdminFile = path.join(publicDir, 'vuma-fibre-admin.html');
const port = Number(process.env.PORT || 4200);
const host = process.env.HOST || '127.0.0.1';
const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:3000';

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8']
]);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      proxy(req, res);
      return;
    }

    if (url.pathname === '/dashboard/service-provider-admin' && existsSync(vumaAdminFile)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      createReadStream(vumaAdminFile).pipe(res);
      return;
    }

    let filePath = path.join(publicDir, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (url.pathname === '/' || !existsSync(filePath)) {
      filePath = indexFile;
    }

    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = indexFile;
    }

    res.writeHead(200, {
      'Content-Type': types.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error.message);
  }
}).listen(port, host, () => {
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`Duranki local demo listening on http://${displayHost}:${port}`);
  console.log(`Forwarding API requests to ${apiTarget}`);
});

function proxy(req, res) {
  const target = new URL(req.url || '/', apiTarget);
  const proxyReq = httpRequest(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host
      }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`API proxy error: ${error.message}`);
  });

  req.pipe(proxyReq);
}
