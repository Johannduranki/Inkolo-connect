const $=s=>document.querySelector(s);
let access={scopes:[]},data={people:[],trees:[],relationships:[],leadership:[],succession:[],documents:[]},selected=null,editing=null,cy;
new ResizeObserver(()=>{if(cy){cy.resize();cy.fit(undefined,55);}}).observe($('#graph'));
const values=form=>Object.fromEntries(new FormData(form));
async function api(path,body,method='POST'){
  const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token');
  const headers={Authorization:'Bearer '+(token||'')};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch('/api/heritage'+path,{method:body?method:'GET',headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,cache:'no-store'});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Request failed. Sign in again if your session expired.');}
  return r.headers.get('content-type')?.includes('application/json')?r.json():r.blob();
}
function message(e){$('#message').textContent=e.message||e;}
async function run(fn){try{await fn();}catch(e){message(e);}}
function options(select,rows,value,label){const old=select.value;select.replaceChildren();for(const r of rows){const o=document.createElement('option');o.value=r[value];o.textContent=label(r);select.append(o);}if(rows.some(r=>r[value]===old))select.value=old;}
function show(id){const dialog=$('#'+id);dialog.querySelector('.error')?.replaceChildren();dialog.showModal();}
document.querySelectorAll('.cancel').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function bind(id,fn){$('#'+id).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=e.submitter;button.disabled=true;const error=form.querySelector('.error');if(error)error.textContent='';try{await fn(values(form),form);if(id!=='invite-form')form.closest('dialog')?.close();}catch(e){if(error)error.textContent=e.message;else message(e);}finally{button.disabled=false;}};}
let initialScope=new URLSearchParams(location.search).get('communityId'),loadGeneration=0;
async function loadAccess(){
  access=await api('/access');$('#admin').hidden=!access.platform;options($('#scope'),access.scopes,'community_id',s=>s.name+' ('+s.tenant_id+')');
  if(initialScope){if(access.scopes.some(s=>s.community_id===initialScope))$('#scope').value=initialScope;initialScope=null;}
  $('#invitations').hidden=!access.invitations?.length;$('#invitation-list').replaceChildren();
  for(const invitation of access.invitations||[]){
    const row=document.createElement('p'),label=document.createElement('span');label.textContent=invitation.display_name+' - '+(access.scopes.find(s=>s.community_id===invitation.community_id)?.name||'Family invitation')+' ';
    row.append(label);
    for(const action of ['accept','decline']){const button=document.createElement('button');button.textContent=action==='accept'?'Claim my profile':'Decline';button.onclick=()=>run(async()=>{button.disabled=true;try{await api('/invitations/'+invitation.invitation_id+'/'+action,{});$('#scope').value=invitation.community_id;await loadAccess();message(action==='accept'?'Profile claimed. Privacy is now Private.':'Invitation declined.');}finally{button.disabled=false;}});row.append(button);}
    $('#invitation-list').append(row);
  }
  await load();
}
async function load(){
  const generation=++loadGeneration;
  data={people:[],trees:[],relationships:[],leadership:[],succession:[],documents:[]};
  options($('#tree'),[],'tree_id',t=>t.name);render();
  selected=null;$('#person-actions').hidden=true;$('#details').replaceChildren();$('#person-title').textContent='Family records';$('#person-summary').textContent='Select a person';
  $('#path-result').textContent='';$('#duplicate-results').replaceChildren();$('#invite-result').textContent='';
  const scope=access.scopes.find(s=>s.community_id===$('#scope').value);$('#configure').elements.tenant_enabled.checked=!!scope?.tenant_enabled;$('#configure').elements.enabled.checked=!!scope?.enabled;
  const enabled=scope?.enabled&&scope?.tenant_enabled;$('#new-tree').disabled=!enabled;$('#new-person').disabled=!enabled;
  const joined=access.subscriptions?.some(s=>s.communityId===scope?.community_id&&s.status==='active');
  $('#join').hidden=!enabled||joined;$('#subscription-status').textContent=!enabled?'Service unavailable':joined?'Heritage subscription active - R0 per month':'Heritage - R0 per month';
  if(!enabled){data={people:[],trees:[],relationships:[],leadership:[],succession:[],documents:[]};options($('#tree'),[],'tree_id',t=>t.name);render();message(scope?'Heritage is not enabled for this community.':'No tenant-linked community is assigned to your account.');return;}
  let result;
  try{result=await api('/tree?community_id='+encodeURIComponent(scope.community_id));}
  catch(error){if(generation!==loadGeneration)return;throw error;}
  if(generation!==loadGeneration)return;
  data=result;options($('#tree'),data.trees,'tree_id',t=>t.name);render();message(data.trees.length?'':'No family trees yet.');
}
const people=()=>data.people.filter(p=>p.tree_id===$('#tree').value);
const name=id=>data.people.find(p=>p.person_id===id)?.display_name||'Unavailable';
function portrait(person){
  const canvas=document.createElement('canvas');canvas.width=144;canvas.height=144;
  const ctx=canvas.getContext('2d'),palette=['#dbece4','#e0e8f5','#f4e3dd','#ebe3f3'];
  const colour=palette[[...person.person_id].reduce((n,c)=>n+c.charCodeAt(0),0)%palette.length];
  ctx.fillStyle=colour;ctx.fillRect(0,0,144,144);
  ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(72,52,24,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(72,127,47,44,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#284f4a';ctx.font='bold 27px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(person.display_name.split(/\s+/u).filter(Boolean).slice(0,2).map(s=>[...s][0]).join('').toUpperCase(),72,117);
  return canvas.toDataURL();
}
function treeBackdrop(){
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=760;const ctx=canvas.getContext('2d');
  ctx.lineCap='round';ctx.globalAlpha=.13;
  function branch(x,y,length,angle,width,depth){
    const nx=x+Math.cos(angle)*length,ny=y+Math.sin(angle)*length;
    ctx.strokeStyle=depth>2?'#739589':'#83ad9a';ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+Math.cos(angle+.12)*length*.55,y+Math.sin(angle+.12)*length*.55,nx,ny);ctx.stroke();
    if(depth){branch(nx,ny,length*.73,angle-.48,width*.65,depth-1);branch(nx,ny,length*.69,angle+.55,width*.65,depth-1);}
    else{ctx.fillStyle='#87b79b';ctx.beginPath();ctx.ellipse(nx,ny,15,6,angle,0,Math.PI*2);ctx.fill();}
  }
  branch(600,755,170,-Math.PI/2,24,6);
  $('#graph').style.backgroundImage='url('+canvas.toDataURL()+')';
}
treeBackdrop();
function render(){
  const list=people(),ids=new Set(list.map(p=>p.person_id)),edges=data.relationships.filter(r=>ids.has(r.from_person_id)&&ids.has(r.to_person_id));
  document.querySelectorAll('.person-choice').forEach(s=>options(s,list,'person_id',p=>p.display_name));
  const me=list.find(p=>p.claimed_user_id===access.userId);if(me)$('#path').elements.from.value=me.person_id;
  $('#new-person').disabled=!$('#tree').value;
  $('#people-list').replaceChildren();for(const p of list){const b=document.createElement('button');b.textContent=p.display_name;b.onclick=()=>select(p.person_id);$('#people-list').append(b);}
  cy?.destroy();
  cy=cytoscape({container:$('#graph'),elements:[...list.map(p=>({data:{id:p.person_id,label:p.display_name+(p.birth_date?'\n'+p.birth_date.slice(0,4)+(p.death_date?' – '+p.death_date.slice(0,4):''):''),portrait:portrait(p),claimed:!!p.claimed_user_id}})),...edges.map(r=>({data:{id:r.relationship_id,source:r.from_person_id,target:r.to_person_id,label:r.type,kind:r.kind}}))],
    style:[
      {selector:'node',style:{'background-color':'#ffffff','background-image':'data(portrait)','background-fit':'cover','border-color':'#ffffff','border-width':4,label:'data(label)',color:'#163e36','text-valign':'bottom','text-margin-y':8,'font-size':13,'font-weight':600,width:60,height:60,'text-wrap':'wrap','text-max-width':200,'text-background-color':'#ffffff','text-background-opacity':.94,'text-background-padding':'4px','text-background-shape':'roundrectangle','overlay-opacity':0}},
      {selector:'edge',style:{width:3,'line-color':'#407e65','target-arrow-color':'#407e65','target-arrow-shape':'triangle','arrow-scale':.8,'curve-style':'taxi','taxi-direction':'downward','taxi-turn':'50%','line-cap':'round'}},
      {selector:'edge[label != "parent"]',style:{width:2,'line-style':'dashed','target-arrow-shape':'none','curve-style':'bezier','line-color':'#8d76a5','source-distance-from-node':8}},
      {selector:'node:selected',style:{'border-color':'#ce9b36','border-width':6,'text-background-color':'#fff3cd'}},
      {selector:'edge:selected',style:{'line-color':'#ce9b36','target-arrow-color':'#ce9b36'}}
    ],layout:{name:'preset'},minZoom:.15,maxZoom:3});
  cy.nodes().union(cy.edges('[label = "parent"]')).layout({name:'breadthfirst',directed:true,padding:65,spacingFactor:1.45,avoidOverlap:true}).run();
  cy.on('tap','node',e=>select(e.target.id()));
  $('#relationship-list').replaceChildren();for(const r of edges){const p=document.createElement('p');p.textContent=name(r.from_person_id)+' → '+r.type+' ('+r.kind+') → '+name(r.to_person_id);if(list.find(p=>p.person_id===r.from_person_id)?.canEdit&&list.find(p=>p.person_id===r.to_person_id)?.canEdit){const b=document.createElement('button');b.textContent='Remove';b.onclick=()=>run(async()=>{if(!confirm('Remove this relationship?'))return;await api('/relationships/'+r.relationship_id,{},'DELETE');await load();});p.append(b);}$('#relationship-list').append(p);}
  $('#succession-list').replaceChildren();for(const r of data.succession.filter(s=>s.tree_id===$('#tree').value)){const p=document.createElement('p');p.textContent=name(r.predecessor_id)+' → '+name(r.successor_id)+' | '+r.office+' | '+r.effective_on;$('#succession-list').append(p);}
}
function select(id){
  selected=data.people.find(p=>p.person_id===id);if(!selected)return;cy.$(':selected').unselect();cy.getElementById(id).select();
  $('#person-title').textContent=selected.display_name;$('#person-summary').textContent=selected.privacy+' · '+selected.verification+(selected.claimed_user_id?' · Claimed':' · Unclaimed');
  $('#person-actions').hidden=false;for(const s of ['#edit','#invite','#royal','#document'])$(s).disabled=!selected.canEdit;$('#invite').disabled=!selected.canEdit||!!selected.claimed_user_id;
  $('#details').replaceChildren();const add=text=>{const p=document.createElement('p');p.textContent=text;$('#details').append(p);};
  add('Born: '+(selected.birth_date||'Not recorded')+' | Died: '+(selected.death_date||'Not recorded'));if(selected.notes)add(selected.notes);
  if(selected.privacy==='Public'){const link=document.createElement('a');link.href='/api/heritage/public/'+id;link.textContent='Public profile summary';link.target='_blank';link.rel='noopener';$('#details').append(link);}
  for(const r of data.leadership.filter(r=>r.person_id===id))add(r.title+' · '+r.royal_house+' · '+r.clan+' | '+(r.reign_from||'?')+' – '+(r.reign_to||'present'));
  for(const d of data.documents.filter(d=>d.person_id===id)){const b=document.createElement('button');b.textContent=d.filename;b.onclick=()=>run(async()=>{const blob=await api('/documents/'+d.document_id);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=d.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});$('#details').append(b);}
  $('#path').elements.to.value=id;
}
$('#scope').onchange=()=>run(load);$('#tree').onchange=()=>{selected=null;$('#person-actions').hidden=true;$('#details').replaceChildren();render();};$('#reload').onclick=()=>run(loadAccess);
$('#new-tree').onclick=()=>show('tree-dialog');
$('#new-person').onclick=()=>{editing=null;$('#person-form').reset();$('#duplicate-results').replaceChildren();$('#form-title').textContent='Add person';show('person-dialog');};
$('#edit').onclick=()=>{editing=selected;$('#person-form').reset();for(const key of ['display_name','birth_date','death_date','privacy','notes'])$('#person-form').elements[key].value=selected[key];$('#form-title').textContent='Edit person';$('#duplicate-results').replaceChildren();show('person-dialog');};
for(const id of ['invite','verify','royal'])$('#'+id).onclick=()=>show(id+'-dialog');
$('#zoom-in').onclick=()=>cy?.zoom(cy.zoom()*1.2);$('#zoom-out').onclick=()=>cy?.zoom(cy.zoom()/1.2);$('#fit').onclick=()=>cy?.fit(undefined,55);
$('#search').oninput=()=>{const q=$('#search').value.toLowerCase();for(const b of $('#people-list').children)b.hidden=!b.textContent.toLowerCase().includes(q);};
$('#duplicates').onclick=()=>run(async()=>{const b=values($('#person-form')),matches=await api('/duplicates',{...b,community_id:$('#scope').value});$('#duplicate-results').textContent=matches.length?matches.map(p=>p.display_name+' '+(p.birth_date||'')+' | '+p.person_id).join('; '):'No visible matching names found.';});
bind('configure',async(b,form)=>{const s=access.scopes.find(s=>s.community_id===$('#scope').value);await api('/configuration',{...s,enabled:form.elements.enabled.checked,tenant_enabled:form.elements.tenant_enabled.checked},'PUT');await loadAccess();});
bind('verifier',async(b,form)=>{await api('/verifiers',{...b,community_id:$('#scope').value,enabled:form.elements.enabled.checked},'PUT');message('Verifier access saved.');});
bind('tree-form',async b=>{const result=await api('/trees',{...b,community_id:$('#scope').value});await loadAccess();$('#tree').value=result.tree_id;render();select(result.person_id);});
bind('person-form',async b=>{const result=await api(editing?'/people/'+editing.person_id:'/people',{...b,tree_id:$('#tree').value,version:editing?.version},editing?'PUT':'POST');const id=editing?.person_id||result.person_id;await load();const p=data.people.find(p=>p.person_id===id);if(p){$('#tree').value=p.tree_id;render();select(id);}});
bind('relationship',async b=>{await api('/relationships',b);await load();});
bind('path',async b=>{const r=await api('/path?'+new URLSearchParams(b));$('#path-result').textContent=r.label+(r.path.length?': '+name(b.from)+' → '+r.path.map(p=>p.label+': '+name(p.id)).join(' → '):'');});
bind('succession',async b=>{await api('/succession',b);await load();});
bind('invite-form',async b=>{const r=await api('/people/'+selected.person_id+'/invitations',b);$('#invite-result').textContent='Share this code privately with your relative: '+r.token;});
bind('claim',async b=>{await api('/claim',b);$('#claim').reset();await loadAccess();message('Profile claimed. Privacy is now Private.');});
bind('verify-form',async b=>{await api('/people/'+selected.person_id+'/verification',b);await load();});
bind('royal-form',async b=>{await api('/leadership',{...b,person_id:selected.person_id});await load();});
$('#document').onchange=()=>run(async()=>{const file=$('#document').files[0];if(!file||!selected)return;const body=new FormData();body.append('document',file);await api('/people/'+selected.person_id+'/documents',body);await load();message('Supporting document uploaded.');});
$('#join').onclick=()=>run(async()=>{await api('/enrol',{community_id:$('#scope').value});await loadAccess();message('Heritage subscription active.');});
run(loadAccess);
