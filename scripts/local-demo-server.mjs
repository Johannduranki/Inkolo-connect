import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { originRelativeUrl, localSecurityHeaders, proxyApiRequest } from './local-proxy-security.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'frontend', 'dist', 'duranki-login', 'browser');
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

export function createLocalServer({ target = apiTarget, directory = publicDir } = {}) {
 const publicDir = path.resolve(directory);
 const indexFile = path.join(publicDir, 'index.html');
 const vumaAdminFile = path.join(publicDir, 'vuma-fibre-admin.html');
 const proxy = (req, res) => proxyApiRequest(req, res, target);
 return createServer({ headersTimeout: 15000, requestTimeout: 120000 }, async (req, res) => {
  localSecurityHeaders(res);
  try {
    const url = originRelativeUrl(req.url || '/');
    if(['/dashboard/wholesaler-orders','/wholesaler-orders.js','/wholesaler-orders.css','/wholesaler-navigation.js'].includes(url.pathname)){proxy(req,res);return;}
    if(['/private-downloads.js','/wallet-request-key.js'].includes(url.pathname)){proxy(req,res);return;}
    if(url.pathname==='/catalogue-status.js'){proxy(req,res);return;}
    if(['/join-community','/join-community.js','/community-registration-link.js'].includes(url.pathname)){proxy(req,res);return;}
    if(['/two-factor.css','/google-authenticator.png'].includes(url.pathname)){proxy(req,res);return;}
    if(['/dashboard/trader-training','/trader-training.js','/trader-training.css','/trader-training-navigation.js','/study-modules.js','/study-modules.css'].includes(url.pathname)){proxy(req,res);return;}
    if(['/dashboard/community-reports','/community-reports.js','/community-reports.css'].includes(url.pathname)){proxy(req,res);return;}
    if(['/admin-layout.js','/admin-layout.css','/admin-responsive.css'].includes(url.pathname)){proxy(req,res);return;}
    if(['/dashboard/branding','/branding.js','/branding-display.js'].includes(url.pathname)){proxy(req,res);return;}
    if(['/dashboard/service-pricing','/service-pricing.js','/service-pricing.css'].includes(url.pathname)){proxy(req,res);return;}
    if(['/dashboard/cycle','/payments/cycle','/cycle.js','/cycle.css','/cycle-billing-ui.js','/cycle-billing-link.js','/cycle-billing.css'].includes(url.pathname)){proxy(req,res);return;}
    if (/^\/dashboard\/services\/[a-z0-9-]+$/.test(url.pathname)) { proxy(req,res); return; }
    if(['/dashboard-switcher.js','/tenant-operations.js','/dashboard/tenant','/tenant-access.js','/tenant-access.css','/tenant-access-link.js'].includes(url.pathname)){proxy(req,res);return;}
    if(['/dashboard/heritage','/heritage.js','/heritage.css','/heritage-cytoscape.js'].includes(url.pathname)){proxy(req,res);return;}

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/') || ['/admin-navigation.js','/presence.js','/dashboard/users','/user-directory.js','/dashboard/treasury','/treasury.js','/treasury.css','/treasury-navigation.js','/two-factor','/two-factor.js','/mfa-navigation.js'].includes(url.pathname)) {
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
    const relative = path.relative(publicDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
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
    if(filePath === indexFile) res.end(readFileSync(indexFile,'utf8').replace('</head>','<style>.online-speedometer-panel{display:none!important}</style></head>').replace('</body>','<script src="/wholesaler-navigation.js" defer></script><script src="/treasury-navigation.js?v=presence-20261013" defer></script><script src="/mfa-navigation.js" defer></script><script src="/wallet-request-key.js" defer></script></body>'));
    else createReadStream(filePath).pipe(res);
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(error.status === 400 || error instanceof URIError ? 400 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unable to serve this request.');
  }
 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createLocalServer().listen(port, host, () => {
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`Duranki local demo listening on http://${displayHost}:${port}`);
  console.log(`Forwarding API requests to ${apiTarget}`);
});
