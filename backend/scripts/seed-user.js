import { getConfig } from '../src/config.js';
import { getPool } from '../src/database.js';
import { hashIdNumber, isValidIdNumber, lastFour } from '../src/id-number.js';

const idNumber = process.argv[2] || '7711035072086';

if (!isValidIdNumber(idNumber)) {
  throw new Error('The seed ID must contain between 6 and 20 digits.');
}

const config = getConfig();
const pool = getPool();

await pool.execute(
  `INSERT INTO users
    (id_number_hash, id_number_last4, first_name, last_name, email, status)
   VALUES (?, ?, ?, ?, ?, 'active')
   ON DUPLICATE KEY UPDATE
    first_name = VALUES(first_name),
    last_name = VALUES(last_name),
    email = VALUES(email),
    status = 'active'`,
  [
    hashIdNumber(idNumber, config.idPepper),
    lastFour(idNumber),
    'Test',
    'User',
    'test.user@example.com'
  ]
);

console.log(`Test user created. Login ID ends in ${lastFour(idNumber)}.`);
await pool.end();
