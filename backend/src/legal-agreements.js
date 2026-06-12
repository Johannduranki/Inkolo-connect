import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updatePlatformState } from './platform-store.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(moduleDirectory, '../../frontend/public');

const serviceNames = {
  'build-up-balance': 'Buy & Sell',
  funeral: 'Funeral Services',
  community: 'My Community',
  referral: 'Referral Program',
  'job-search': 'Job Search',
  'vas-services': 'VAS Services',
  eduu: 'EduU',
  'vuma-fibre': 'Vuma Fibre',
  'catch-a-ride': 'Catch a Ride',
  kzncc: 'KZNCC Membership',
  'keycha-properties': 'Keytcha Properties',
  wallet: 'My Wallet'
};

const archivedDocuments = {
  'build-up-balance': 'buy-sell-terms.html',
  'catch-a-ride': 'catch-a-ride-terms.html',
  funeral: 'funeral-services-terms.html',
  community: 'my-community-terms.html',
  'vas-services': 'vas-services-terms.html',
  'keycha-properties': 'keytcha-properties-terms.html',
  referral: 'referral-service-terms.html',
  'job-search': 'job-search-terms.html',
  eduu: 'eduu-service-terms.html',
  wallet: 'wallet-terms.html',
  kzncc: 'kzncc-service-terms.html'
};

function genericTerms(serviceCode, planCode) {
  const serviceName = serviceNames[serviceCode] ?? serviceCode;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${serviceName} Terms</title></head>
<body>
<h1>${serviceName} Terms and Conditions</h1>
<p>Version 1.0, effective 10 June 2026.</p>
<p>Inkolo Connect (Pty) Ltd, registration number 2025/674136/07.</p>
<p>The member requests activation of the ${serviceName} service under plan ${planCode}.</p>
<p>The member confirms that the information supplied is accurate, agrees to applicable service fees,
privacy processing, service rules, provider requirements, and electronic record keeping.</p>
<p>The member understands that third-party provider services remain subject to provider approval,
availability, regulatory requirements, and any additional policy or product documents issued later.</p>
</body></html>`;
}

export function getTermsDocument(serviceCode, planCode) {
  const filename = archivedDocuments[serviceCode];
  let content;
  let sourceFile = null;
  if (filename) {
    sourceFile = filename;
    content = readFileSync(path.join(publicDirectory, filename), 'utf8');
  } else {
    content = genericTerms(serviceCode, planCode);
  }
  const version = '1.0';
  return {
    title: `${serviceNames[serviceCode] ?? serviceCode} Terms and Conditions`,
    version,
    mimeType: 'text/html; charset=utf-8',
    sourceFile,
    content,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex')
  };
}

export function createAcceptanceEvidence({
  user,
  serviceCode,
  planCode,
  request
}) {
  const document = getTermsDocument(serviceCode, planCode);
  return {
    id: randomUUID(),
    userId: String(user.id),
    memberName: `${user.first_name ?? user.firstName} ${user.last_name ?? user.lastName}`,
    memberTelephone: user.telephone_number ?? user.telephoneNumber ?? null,
    memberEmail: user.email ?? null,
    serviceCode,
    serviceName: serviceNames[serviceCode] ?? serviceCode,
    planCode,
    documentTitle: document.title,
    documentVersion: document.version,
    documentSha256: document.sha256,
    documentMimeType: document.mimeType,
    documentSourceFile: document.sourceFile,
    documentSnapshot: document.content,
    consentStatement:
      'I confirm that I have read, understood and agree to these Terms and Conditions.',
    acceptedAt: new Date().toISOString(),
    ipAddress: request.ip || request.socket?.remoteAddress || null,
    userAgent: request.get('user-agent') ?? null
  };
}

export function saveDemoAcceptance(evidence) {
  return updatePlatformState((state) => {
    state.legalAcceptances ??= [];
    state.legalAcceptances.push(evidence);
    return evidence;
  });
}
