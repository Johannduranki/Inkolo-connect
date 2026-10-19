import fs from 'node:fs';
const chapters = ['Encoding-and-Sanitization','Validation-and-Business-Logic','Web-Frontend-Security','API-and-Web-Service','File-Handling','Authentication','Session-Management','Authorization','Self-contained-Tokens','OAuth-and-OIDC','Cryptography','Secure-Communication','Configuration','Data-Protection','Secure-Coding-and-Architecture','Security-Logging-and-Error-Handling','WebRTC'];
const passed = new Set(['9.1.1','9.1.2','9.1.3','9.2.1','9.2.3','9.2.4']);
const evidence = { 1:'Angular sanitization and parameterized SQL exist; complete sink review pending.', 2:'Listing allowlists and financial tests exist; complete schema coverage pending.', 3:'Helmet and explicit origins exist; browser CSP/DOM review pending.', 4:'API_SECURITY_MATRIX.md; per-endpoint review pending.', 5:'upload-security.js; malware scanning and legacy ownership recovery pending.', 6:'password-security.js, mfa.js; recovery and account-aware throttling pending.', 7:'session-security.js; all UI logout paths and multi-instance session deployment pending.', 8:'role-security.js and scoped tenant tests; legacy provider/admin scopes remain open.', 9:'token-security.js and security-hardening.test.js; token-type completeness still under review.', 11:'scrypt, bcrypt compatibility, AES-GCM; legacy hash migration/key rotation pending.', 12:'Production HTTPS origin guard; actual server TLS and DB TLS not verified.', 13:'Production guards and CI scans; infrastructure audit pending.', 14:'Private download guards; tracked personal data/history remediation pending.', 15:'Architecture mapped; complete threat model and every code path review pending.', 16:'Winston safe metadata; complete security event coverage and SIEM pending.' };
const rows = [];
for (let i=0;i<chapters.length;i++) {
  const file = `0x${10+i}-V${i+1}-${chapters[i]}.md`;
  const url = `https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot verify ASVS chapter ${i+1}`);
  const text = await response.text();
  for (const match of text.matchAll(/\|\s*\*\*(\d+\.\d+\.\d+)\*\*\s*\|.*?\|\s*(\d)\s*\|/g)) {
    const id = match[1], level = Number(match[2]);
    if (level > 2) continue;
    const na = [10,17].includes(i+1);
    rows.push({ id, level, status: na ? 'NOT APPLICABLE' : passed.has(id) ? 'PASS' : 'PARTIAL', evidence: na ? 'No OAuth/OIDC or WebRTC implementation in the reviewed runtime; re-evaluate if added.' : passed.has(id) ? 'token-security.js; signed token verification, fixed HS256/key, expiry/issuer/audience tests.' : evidence[i+1], url });
  }
}
const applicable = rows.filter(r=>r.status!=='NOT APPLICABLE');
const pass = applicable.filter(r=>r.status==='PASS').length;
const output = `# OWASP ASVS 5.0 Level 2 Matrix\n\nStatus: INCOMPLETE. Requirements include levels 1 and 2 from the official v5.0.0 tag. IDs link to authoritative descriptions; descriptions are not reproduced.\n\nPASS = evidence for this narrow control, not whole-system certification. PARTIAL = incomplete or not yet independently verified, never counted as compliant. FAIL = demonstrated unresolved violation when individually assessed. NOT APPLICABLE = reviewed feature absent; reassess when architecture changes. Open findings in SECURITY_AUDIT.md override any broad partial evidence.\n\nVerified PASS coverage: ${pass}/${applicable.length} applicable controls (${(pass/applicable.length*100).toFixed(1)}%). Total L1/L2 controls: ${rows.length}. This is not an overall security score.\n\n| Control | Level | Status | Evidence / gap |\n|---|---|---|---|\n${rows.map(r=>`| [${r.id}](${r.url}) | ${r.level} | ${r.status} | ${r.evidence} |`).join('\n')}\n`;
fs.mkdirSync('docs/security', { recursive:true });
fs.writeFileSync('docs/security/OWASP_ASVS_MATRIX.md', output);
console.log(JSON.stringify({ controls: rows.length, applicable: applicable.length, pass, coverage: (pass/applicable.length*100).toFixed(1) }));
