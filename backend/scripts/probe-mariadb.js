import 'dotenv/config';
import mysql from 'mysql2/promise';

let connection;
try {
  connection = await mysql.createConnection({host:process.env.DB_HOST, port:Number(process.env.DB_PORT || 3306), user:process.env.DB_USER, password:process.env.DB_PASSWORD, connectTimeout:5000});
  const [schemas] = await connection.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [process.env.DB_NAME]);
  const result = {connected:true,databaseExists:schemas.length === 1};
  if (!process.argv.includes('--server-only') && result.databaseExists) {
    const [tables] = await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [process.env.DB_NAME]);
    result.tables = tables.map(row => row.TABLE_NAME);
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({connected:false,code:error.code || 'CONNECTION_FAILED'}));
  process.exitCode = 1;
} finally { await connection?.end(); }
