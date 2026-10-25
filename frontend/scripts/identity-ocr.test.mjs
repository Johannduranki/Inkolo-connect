import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/app/identity-ocr.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseIdentityText} = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('reads labelled synthetic identity fields, including date and gender', () => {
  assert.deepEqual(parseIdentityText('TEST DOCUMENT\nSurname: SAMPLE\nNames: EXAMPLE PERSON\nID Number: 9001015009087\nDate of birth: 01 JAN 1990\nSex: M'), {
    firstName:'EXAMPLE PERSON',lastName:'SAMPLE',idNumber:'9001015009087',dateOfBirth:'1990-01-01',gender:'male'
  });
});

test('reads smart-card labels on separate lines without consuming the next label', () => {
  const result = parseIdentityText('Surname\nSAMPLE\nNames\nEXAMPLE PERSON\nNationality\nRSA\nIdentity Number\n900101 5009 087\nDate of Birth\n1990/01/01\nGender\nFemale');
  assert.equal(result.firstName,'EXAMPLE PERSON');
  assert.equal(result.lastName,'SAMPLE');
  assert.equal(result.idNumber,'9001015009087');
  assert.equal(result.dateOfBirth,'1990-01-01');
  assert.equal(result.gender,'female');
  assert.equal(parseIdentityText('Names\nSurname\nSAMPLE').firstName,'');
});

test('does not invent unreadable fields or infer gender/date from an ID number', () => {
  assert.deepEqual(parseIdentityText('No readable fields'),{firstName:'',lastName:'',idNumber:'',dateOfBirth:'',gender:''});
  const result = parseIdentityText('ID Number: 9001015009087\nDOB: 31 FEB 1990\nSex: unclear\nSurname: 1234');
  assert.equal(result.dateOfBirth,'');assert.equal(result.gender,'');assert.equal(result.lastName,'');
});

test('validates calendar dates and supports hyphenated names', () => {
  assert.equal(parseIdentityText('DOB: 29/02/2000').dateOfBirth,'2000-02-29');
  assert.equal(parseIdentityText('DOB: 29/02/2001').dateOfBirth,'');
  assert.equal(parseIdentityText("Surname: O'EXAMPLE-SAMPLE").lastName,"O'EXAMPLE-SAMPLE");
});

test('English model is bundled and OCR uses same-origin assets without a persistent cache', async () => {
  const model = await readFile(new URL('../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url));
  assert.equal(model[0],0x1f);assert.equal(model[1],0x8b);
  const angular = JSON.parse(await readFile(new URL('../angular.json',import.meta.url),'utf8'));
  assert.ok(angular.projects['duranki-login'].architect.build.options.assets.some(asset => asset.output === '/tesseract-data/' && asset.glob === 'eng.traineddata.gz'));
  const component = await readFile(new URL('../src/app/login.component.ts', import.meta.url),'utf8');
  assert.match(component,/module\.default \?\? module/);
  assert.match(component,/langPath: window.location.origin \+ '\/tesseract-data'/);
  assert.match(component,/cacheMethod: 'none'/);
});
