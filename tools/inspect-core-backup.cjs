const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {Parser}=require('../tmp/sql-import-runtime/node_modules/node-sql-parser');
const parser=new Parser();
const tables=new Set(['users','members','community','tenant','user_role','role','zuc_registration']);
const columns={},records={};
const source=process.argv[2];
if(!source)throw new Error('Supply the backup filename.');
const selected={
 users:['id','community_id','first_name','last_name','phone_number','email','password','status','created'],
 members:['id','user_id','community_id','first_name','last_name','phone_number','block_name','church_name','status','is_deceased'],
 community:['id','tenant_id','name','slug','status'],tenant:['id','name','slug','domain','status'],
 user_role:['user_id','role_id','tenant_id','community_id'],role:['id','name','level'],zuc_registration:['user_id','completed']
};
(async()=>{
 let schema=null;
 for await(const line of readline.createInterface({input:fs.createReadStream(source),crlfDelay:Infinity})){
   const create=line.match(/^CREATE TABLE `([^`]+)`/);
   if(create){schema=tables.has(create[1])?create[1]:null;if(schema){columns[schema]=[];records[schema]=[];}continue;}
   if(schema){const field=line.match(/^\s+`([^`]+)`/);if(field)columns[schema].push(field[1]);if(line.startsWith(')'))schema=null;continue;}
   const insert=line.match(/^INSERT INTO `([^`]+)` VALUES /);
   if(!insert||!tables.has(insert[1]))continue;
   const table=insert[1];
   let ast;
   try{ast=parser.astify(line,{database:'MySQL'});}catch{throw new Error(`Unable to parse ${table} safely; no data has been applied.`);}
   if(Array.isArray(ast)){if(ast.length!==1)throw new Error('Unexpected multiple statements.');ast=ast[0];}
   const rows=ast.values?.values || ast.values;
   if(!Array.isArray(rows))throw new Error(`Unexpected parser shape for ${table}`);
   for(const row of rows){
     if(row.value.length!==columns[table].length)throw new Error(`Column mismatch in ${table}`);
     const obj={};row.value.forEach((node,i)=>{
       const key=columns[table][i];if(!selected[table].includes(key))return;
       if(!['number','single_quote_string','string','null','bool'].includes(node.type))throw new Error(`Unsupported SQL value type ${node.type} in ${table}`);
       obj[key]=node.type==='null'?null:node.value;
     });records[table].push(obj);
   }
 }
 const output=path.resolve(__dirname,'../tmp/core-import');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'selected-records.json'),JSON.stringify(records),{mode:0o600});
 const group=(rows,key)=>rows.reduce((out,row)=>{const k=String(row[key]??'NULL');out[k]=(out[k]||0)+1;return out;},{});
 const report={counts:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.length])),tenants:records.tenant,communities:records.community,usersByCommunity:group(records.users,'community_id'),membersByCommunity:group(records.members,'community_id'),roles:records.role,
   passwordFormats:group(records.users.map(u=>({format:/^\$2[aby]\$/.test(u.password)?'bcrypt':!u.password?'empty':/^[a-f0-9]{64}$/i.test(u.password)?'hex64':'other'})),'format')};
 fs.writeFileSync(path.join(output,'inspection-summary.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
