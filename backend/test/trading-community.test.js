import test from 'node:test';
import assert from 'node:assert/strict';
import { isTradingCommunity, applyCommunityIdentity } from '../../frontend/public/dashboard-switcher.js';
test('Trader Connect identity does not classify church communities as traders',()=>{
  assert.equal(isTradingCommunity('trader-ilembe'),true);
  assert.equal(isTradingCommunity('community-ilembe-traders'),true);
  assert.equal(isTradingCommunity(null,'Traders KZN'),true);
  assert.equal(isTradingCommunity('community-zuc','ZUC Community'),false);
  assert.equal(isTradingCommunity('community-core-inkolo','Inkolo Connect'),false);
});
test('trading hero hides faith symbol and restores church copy when switching',()=>{
  let hidden=false;
  const mark={style:{setProperty:()=>hidden=true,removeProperty:()=>hidden=false}};
  const subtitle={textContent:'A welcoming faith community',dataset:{}};
  const heading={textContent:'Traders KZN'};
  const hero={querySelector:s=>s==='.church-mark'?mark:s==='h1'?heading:subtitle};
  const doc={querySelector:()=>hero,querySelectorAll:()=>[]};
  applyCommunityIdentity(doc,'http://localhost/community?communityId=trader-ilembe');
  assert.equal(hidden,true);assert.match(subtitle.textContent,/traders and small businesses/);
  heading.textContent='ZUC Community';
  applyCommunityIdentity(doc,'http://localhost/community?communityId=community-zuc');
  assert.equal(hidden,false);assert.equal(subtitle.textContent,'A welcoming faith community');
});
