import {translate,currentLanguage,onLanguageChange,chooseLanguage,languageSession} from './language.js';
// Only known interface phrases are translated. Form values, cover names and legal text are excluded.
const host=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),status=document.createElement('span');
host.style.cssText='padding:12px 24px;background:#fff;border-bottom:1px solid #cbdde6;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
label.textContent='Language / Ulimi ';select.setAttribute('aria-label','Language / Ulimi');select.append(new Option('English','en'),new Option('isiZulu','zu'));label.append(select);status.setAttribute('role','status');host.append(label,status);document.querySelector('header')?.after(host);
const nodes=new Map();
function phrase(text){
 let result=translate(text);if(result!==text)return result;
 const option=text.match(/^(.*) - (Individual|Single|Family) - (R[\d.,]+) per month$/);if(option)return option[1]+' - '+translate(option[2]==='Single'&&currentLanguage()==='zu'?'Individual':option[2])+' - '+option[3]+' '+translate('per month');
 const field=text.match(/^(Member|Spouse|Child \d+) (First name|Surname|Date of birth|ID number \(optional\)|Contact number \(optional\))$/);
 if(field)return field[1].replace(/^Child/,translate('Child')).replace(/^Member$/,translate('Member')).replace(/^Spouse$/,translate('Spouse'))+' '+translate(field[2]);
 const child=text.match(/^Child (\d+)$/);if(child)return translate('Child')+' '+child[1];
 const price=text.match(/^(Monthly amount payable: )?(R[\d.,]+) per month$/);if(price)return (price[1]?translate('Monthly amount payable')+': ':'')+price[2]+' '+translate('per month');
 return text;
}
function refresh(){
 select.value=currentLanguage();
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){
  if(host.contains(node)||node.parentElement?.closest('script,style,input,textarea,#title,#summary-plan,.plan h3,pre,[data-no-translate]'))continue;
  let record=nodes.get(node);if(!record||node.data!==record.rendered)record={source:node.data,rendered:node.data};
  const trimmed=record.source.trim();const translated=phrase(trimmed);record.rendered=record.source.replace(trimmed,translated);nodes.set(node,record);if(node.data!==record.rendered)node.data=record.rendered;
 }
 for(const node of nodes.keys())if(!node.isConnected)nodes.delete(node);
}
select.onchange=async()=>{select.disabled=true;status.textContent='';try{await chooseLanguage(select.value);}catch{status.textContent=translate('Language preference could not be saved. Please try again.');}finally{select.disabled=false;}};
onLanguageChange(refresh);new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true,characterData:true});refresh();
let token='';try{token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';}catch{}
void languageSession(token).catch(()=>status.textContent=translate('Language preference could not be saved. Please try again.'));
