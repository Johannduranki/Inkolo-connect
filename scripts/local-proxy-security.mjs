import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export function originRelativeUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f#]/.test(value)) {
    throw Object.assign(Error('Invalid request target.'), { status: 400 });
  }
  const url = new URL(value, 'http://duranki.invalid');
  decodeURIComponent(url.pathname);
  return url;
}

export function apiProxyTarget(requestUrl, configuredTarget) {
  const request = originRelativeUrl(requestUrl);
  const target = new URL(configuredTarget);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw Error('Invalid configured API origin.');
  }
  target.pathname = request.pathname;
  target.search = request.search;
  return target;
}

export function proxyHeaders(headers, target) {
  const excluded = new Set(['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'forwarded', 'x-real-ip']);
  for (const token of String(headers.connection || '').split(',')) excluded.add(token.trim().toLowerCase());
  return { ...Object.fromEntries(Object.entries(headers).filter(([key]) => !excluded.has(key.toLowerCase()) && !key.toLowerCase().startsWith('x-forwarded-'))), host: target.host };
}

export function localSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  // Preserve existing scripts/styles; full script CSP awaits deployed/source parity.
  res.setHeader('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
}

export function proxyApiRequest(req, res, configuredTarget, timeoutMs = 30000) {
  const target = apiProxyTarget(req.url, configuredTarget);
  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  let timedOut = false;
  const upstream = transport(target, { method: req.method, headers: proxyHeaders(req.headers, target) }, response => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.setTimeout(timeoutMs, () => { timedOut = true; upstream.destroy(); });
  upstream.on('error', () => {
    if (res.destroyed) return;
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(timedOut ? 504 : 502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('The service is temporarily unavailable. Please try again.');
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  req.pipe(upstream);
}
