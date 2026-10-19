import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const bundle = 'frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source = fs.readFileSync(bundle, 'utf8');
const ast = ts.createSourceFile(bundle, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const edits = [];
const replacements = new Map([
  ['850.00 Izaka', 'Open My Wallet'],
  ['Recent: Community payment +250.00 Izaka', 'View your verified balance and transactions in My Wallet.'],
  ['KZNCC CHURCH DIRECTORY', 'COMMUNITY DIRECTORY'],
  ['A welcoming faith community', 'Your community on Duranki'],
  ['Cycle secure checkout', 'Card top-ups are not connected'],
  ['\u2191 8.4% this month', 'No verified monthly comparison'],
  ['72%', 'Not available'],
  ['8 of 11 controls complete', 'Month-end controls are not connected'],
]);
function visit(node) {
  if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'this.periods' && ts.isArrayLiteralExpression(node.right) && node.right.getText(ast).includes('August 2026')) {
    edits.push({start:node.right.getStart(ast),end:node.right.end,text:'["All recorded dates"]'});
    return;
  }
  if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'this.selectedPeriod' && node.right.getText(ast).includes('August 2026')) {
    edits.push({start:node.right.getStart(ast),end:node.right.end,text:node.right.getText(ast).replace('August 2026','All recorded dates')});
    return;
  }
  if (ts.isStringLiteral(node) && replacements.has(node.text)) edits.push({start:node.getStart(ast),end:node.end,text:JSON.stringify(replacements.get(node.text))});
  if (ts.isNumericLiteral(node) && node.text === '980000') edits.push({start:node.getStart(ast),end:node.end,text:'0'});
  if (ts.isMethodDeclaration(node)) {
    const name = node.name.getText(ast);
    const original = node.getText(ast);
    if (name === 'openTenant' && original.startsWith('openTenant(n){if(!n)return;') && !original.includes('replaceState')) {
      edits.push({start:node.getStart(ast),end:node.end,text:original.replace('if(!n)return;','if(!n)return;window.history.replaceState(window.history.state,"","/dashboard/platform-admin?tenantId="+encodeURIComponent(n.id));')});
    }
    if (name === 'openCommunity' && original.includes('this.selectedTenantId.set(n.tenantId)') && !original.includes('replaceState')) {
      edits.push({start:node.getStart(ast),end:node.end,text:original.replace('openCommunity(n){','openCommunity(n){window.history.replaceState(window.history.state,"","/dashboard/platform-admin?communityId="+encodeURIComponent(n.id));')});
    }
    if (name === 'markPaid' && original.includes('this.receivables')) {
      edits.push({start:node.getStart(ast),end:node.end,text:'markPaid(){this.flash("Payment verification is not connected. No payment status has been changed.")}'});
    }
    if (name === 'matchEntry' && original.includes('this.ledgerEntries')) {
      edits.push({start:node.getStart(ast),end:node.end,text:'matchEntry(){this.flash("Bank-statement matching is not connected. No reconciliation has been recorded.")}'});
    }
    if (name === 'backToDashboard' && original === 'backToDashboard(){this.router.navigate(["/dashboard"])}') {
      edits.push({start:node.getStart(ast),end:node.end,text:'backToDashboard(){const id=this.memberCommunity()?.churchId??new URLSearchParams(window.location.search).get("communityId");window.location.assign("/dashboard/member?from=community"+(id?"&communityId="+encodeURIComponent(id):""))}'});
    }
    if (name === 'confirmPrimaryChurch' && original.includes('queryParams:{from:"community"}')) {
      edits.push({start:node.getStart(ast),end:node.end,text:original.replace('queryParams:{from:"community"}','queryParams:{from:"community",communityId:o.churchId}')});
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
fs.mkdirSync('tmp', {recursive:true});
const backup='tmp/main-before-audit-ui-repair.js';
if (!fs.existsSync(backup)) fs.copyFileSync(bundle,backup);
let output=source;
for(const edit of edits.sort((a,b)=>b.start-a.start)) output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
fs.writeFileSync(bundle,output);

const htmlPath='frontend/src/app/community.component.html';
let html=fs.readFileSync(htmlPath,'utf8');
for(const [before,after] of replacements) html=html.replaceAll(before,after);
html=html.replace('href="/dashboard/member?from=community"','[href]="\'/dashboard/member?from=community&amp;communityId=\' + (memberCommunity()?.churchId || \'\')"');
const start=html.indexOf('  <div class="community-layout">');
const end=html.indexOf('  @if (profileOpen())',start);
if(start>=0&&end>start) html=html.slice(0,start)+'  <section class="community-configuration-status"><h2>Community information</h2><p>Events and contact information are not configured yet.</p></section>\n'+html.slice(end);
fs.writeFileSync(htmlPath,html);
const accountingPath='frontend/src/app/features/accounting/accounting-dashboard.component.html';
let accounting=fs.readFileSync(accountingPath,'utf8');
for(const [before,after] of replacements) accounting=accounting.replaceAll(before,after);
accounting=accounting.replaceAll("{{ 980000 | currency:'ZAR':'symbol-narrow':'1.2-2' }}",'Not configured');
const chartStart=accounting.indexOf('<section class="panel performance">');
const chartEnd=accounting.indexOf('</section>',chartStart);
if(chartStart>=0&&chartEnd>chartStart) accounting=accounting.slice(0,chartStart)+'<section class="panel performance"><h2>Income against expenses</h2><p>Monthly comparisons are unavailable until verified transactions are connected.</p></section>'+accounting.slice(chartEnd+10);
fs.writeFileSync(accountingPath,accounting);
console.log(`Applied ${edits.length} served-bundle repairs and updated community source template.`);
