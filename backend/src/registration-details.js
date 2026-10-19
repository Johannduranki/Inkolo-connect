import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validFileBytes } from './upload-security.js';

const policy = readFileSync(new URL('../../frontend/public/duranki-privacy-policy.txt', import.meta.url));
const fail = message => Object.assign(new Error(message), { status: 400 });
export const registrationSchema = `CREATE TABLE IF NOT EXISTS member_registration_details (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  details LONGTEXT NOT NULL,
  document LONGBLOB NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB`;

export async function ensureRegistrationStorage(pool) {
  try { await pool.query('SELECT user_id FROM member_registration_details LIMIT 0'); }
  catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    try { await pool.query(registrationSchema); }
    catch { throw Object.assign(new Error('Registration storage needs administrator setup. Please try again later.'), {status:503}); }
  }
}

export function registrationDetails(body, file, now = new Date()) {
  if (body.privacyAccepted !== true && body.privacyAccepted !== 'true') throw fail('Please accept the Privacy Policy before registering.');
  const text = (key, limit) => {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw fail(`Invalid ${key}.`);
    return value.trim();
  };
  const idNumber = text('idNumber', 32), dateOfBirth = text('dateOfBirth', 10), gender = text('gender', 32);
  if (idNumber && !/^\d{13}$/.test(idNumber)) throw fail('Enter a 13-digit ID number, or leave it blank.');
  if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(Date.parse(dateOfBirth)) || new Date(dateOfBirth).toISOString().slice(0,10) !== dateOfBirth || dateOfBirth > now.toISOString().slice(0,10))) throw fail('Enter a valid date of birth that is not in the future.');
  if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','application/pdf'].includes(file.mimetype) || !validFileBytes(file.buffer, file.originalname, file.mimetype))) throw fail('Choose a valid JPG, PNG or PDF up to 5 MB.');
  return {
    idNumber, dateOfBirth, gender,
    verificationMethod: file ? 'ID_UPLOAD_PENDING_REVIEW' : 'MANUAL',
    privacy: { accepted: true, acceptedAt: now.toISOString(), policySha256: createHash('sha256').update(policy).digest('hex') },
    document: file ? { mimeType: file.mimetype, bytes: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex') } : null
  };
}

export async function saveSqlRegistrationDetails(connection, userId, details, file) {
  await connection.execute('INSERT INTO member_registration_details(user_id,details,document) VALUES(?,?,?)', [userId, JSON.stringify(details), file?.buffer ?? null]);
}

export function savePlatformRegistrationDetails(state, userId, details, file) {
  state.registrationDetails ??= [];
  state.registrationDetails.push({ userId, details, documentBase64: file?.buffer.toString('base64') ?? null });
}
