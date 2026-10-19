import 'dotenv/config';
import mysql from 'mysql2/promise';
import {createHash} from 'node:crypto';
let connection;
try{
  connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const [tables]=await connection.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",[process.env.DB_NAME]);
  const result={};
  for(const {name} of tables){
    if(!/^[a-zA-Z0-9_]+$/.test(name))throw Error('Unexpected table name.');
    const [rows]=await connection.query('SELECT * FROM `'+name+'`');
    const canonical=rows.map(row=>JSON.stringify(Object.keys(row).sort().map(key=>[key,row[key]]))).sort();
    result[name]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};
  }
  console.log(JSON.stringify(result,null,2));
}catch{console.error('SQL fingerprint failed.');process.exitCode=1;}
finally{await connection?.end();}
