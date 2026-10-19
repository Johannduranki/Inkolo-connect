import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const path = 'frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
let source = fs.readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const edits = [];
function visit(node) {
  if (ts.isMethodDeclaration(node)) {
    const name = node.name.getText(ast);
    const original = node.getText(ast);
    let replacement;
    if (name === 'switchRole' && original.includes('__community:')) {
      replacement = original.replace(
        'this.router.navigate(["/community"],{queryParams:{communityId:o}})',
        'window.location.assign("/community?communityId="+encodeURIComponent(o))'
      );
    }
    if (name === 'getMemberCommunity') {
      replacement = 'getMemberCommunity(n,communityId){return this.http.get(`${this.apiUrl}/community/me`,{params:communityId?{communityId}:{}})}';
    }
    if (name === 'loadSelectedMemberCommunity') {
      const notice = original.includes('this.requestedCommunityId') ? 'subscriptionError' : 'churchLinkedMessage';
      replacement = `loadSelectedMemberCommunity(n){const selected=this.route.snapshot.queryParamMap.get("communityId")??"";this.setMemberCommunity(null);this.communities.getMemberCommunity(String(n),selected).subscribe({next:r=>this.setMemberCommunity(r),error:()=>{this.setMemberCommunity(null);this.${notice}.set("The selected community could not be opened. Please choose a community you belong to or try again.")}})}`;
    }
    if (replacement && replacement !== original) edits.push({ start: node.getStart(ast), end: node.end, replacement });
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (edits.length !== 4) throw new Error(`Expected four community-selection edits; found ${edits.length}`);
fs.mkdirSync('tmp', { recursive: true });
const backup = 'tmp/main-before-community-selection.js';
if (!fs.existsSync(backup)) fs.copyFileSync(path, backup);
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
}
fs.writeFileSync(path, source);
console.log('Updated selected community loading and switcher navigation.');
