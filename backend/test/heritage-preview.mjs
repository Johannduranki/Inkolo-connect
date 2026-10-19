// Isolated, loopback-only visual test. Never uses the real platform store or credentials.
import express from 'express';
import {fileURLToPath} from 'node:url';
import {HeritageStore} from '../src/heritage-store.js';
import {createHeritageRouter} from '../src/heritage-api.js';
const store=new HeritageStore(':memory:'),scope={tenant_id:'test-tenant',community_id:'test-community',name:'Test Community'};
const owner={id:'fixture',name:'Example Member',platform:true,scopes:[scope]};
store.configure(owner,[scope],{...scope,enabled:true,tenant_enabled:true});
const tree=store.createTree(owner,{community_id:scope.community_id,name:'Example Family'});
const add=name=>store.createPerson(owner,{tree_id:tree.tree_id,display_name:name,privacy:'Family'}).person_id;
const parent=add('Example Parent'),grandparent=add('Example Grandparent'),child=add('Example Child');
for(const [a,b] of [[grandparent,parent],[parent,tree.person_id],[tree.person_id,child]])store.addRelationship(owner,{from_person_id:a,to_person_id:b,type:'parent',kind:'biological'});
const state={users:[{id:'fixture',firstName:'Example',lastName:'Member',status:'active',roles:['Platform Admin']}],memberCommunities:[{memberId:'fixture',tenantId:scope.tenant_id,communityId:scope.community_id,communityName:scope.name}]};
const app=express();app.use(express.json());app.use('/api/heritage',createHeritageRouter({store,readState:()=>state,resolveUser:()=>state.users[0],requireAuth:(req,res,next)=>{req.auth={sub:'fixture'};next();}}));
app.get('/dashboard/heritage',(req,res)=>res.sendFile(fileURLToPath(new URL('../../frontend/public/heritage.html',import.meta.url))));
app.get('/heritage-cytoscape.js',(req,res)=>res.sendFile(fileURLToPath(new URL('../node_modules/cytoscape/dist/cytoscape.min.js',import.meta.url))));
app.use(express.static(fileURLToPath(new URL('../../frontend/public/',import.meta.url))));
const server=app.listen(4329,'127.0.0.1',()=>console.log('Synthetic Heritage preview on http://127.0.0.1:4329/dashboard/heritage'));
setTimeout(()=>{server.close();store.db.close();},300000);
