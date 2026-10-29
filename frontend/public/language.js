let zu={};
async function loadLanguage(value){if(value==='zu')zu=(await import('./language-catalogue.js')).zu;}
let language='en',dirty=false,token='',endpoint='/api/preferences/language',generation=0;
const listeners=new Set();
export const currentLanguage=()=>language;
export const translate=text=>language==='zu'?(zu[text]??text):text;
export function onLanguageChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
function apply(value){language=value;document.documentElement.lang=value;for(const fn of listeners)fn();}
async function request(method,value,auth){const r=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:method==='PUT'?JSON.stringify({language:value}):undefined,cache:'no-store'});if(!r.ok)throw Error('Language preference could not be saved. Please try again.');return r.json();}
export async function languageSession(auth,url='/api/preferences/language'){
 const next=auth||'';endpoint=url;if(next===token)return;token=next;const version=++generation;
 if(!next)return;
 const chosen=language,pending=dirty;
 const result=await request(pending?'PUT':'GET',chosen,next);
 if(version!==generation)return;
 if(['en','zu'].includes(result.language)){await loadLanguage(result.language);if(version!==generation)return;dirty=false;apply(result.language);}
}
export async function chooseLanguage(value){if(!['en','zu'].includes(value))throw Error('Choose English or isiZulu.');const version=++generation;await loadLanguage(value);if(version!==generation)return;dirty=true;apply(value);if(token){await request('PUT',value,token);if(version===generation)dirty=false;}}
export function resetLanguage(){token='';dirty=false;++generation;apply('en');}
