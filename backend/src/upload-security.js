import path from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import { canAccessProviderDocument } from './provider-security.js';
export function validFileBytes(bytes, filename, mime) {
  const extension = path.extname(filename).toLowerCase();
  if (bytes.length < 12) return false;
  if (extension === '.pdf' && mime === 'application/pdf') return bytes.subarray(0,5).toString() === '%PDF-';
  if (['.jpg','.jpeg'].includes(extension) && mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (extension === '.png' && mime === 'image/png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (extension === '.webp' && mime === 'image/webp') return bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  return false;
}
export function validateUploadedFiles(req, res, next) {
  const files = req.file ? [req.file] : Object.values(req.files || {}).flat();
  try {
    if (files.some(file => !validFileBytes(readFileSync(file.path), file.originalname, file.mimetype))) {
      for (const file of files) unlinkSync(file.path);
      return res.status(400).json({ message: 'The file contents do not match an allowed document or image type.' });
    }
    return next();
  } catch { return next(Object.assign(new Error('Upload validation failed.'), { status: 400 })); }
}
export function canReadUpload(state, user, relativePath) {
  if (user?.status !== 'active') return false;
  if (user.roles?.some(role => ['Platform Admin','DURANKI_ADMIN'].includes(role))) return true;
  const id = String(user.id);
  return (state.memberDocuments || []).some(doc => doc.fileUrl === `/uploads${relativePath}` && (String(doc.memberId) === id || canAccessProviderDocument(state, user, doc)))
    || (state.privateUploadOwners || []).some(doc => doc.path === relativePath && String(doc.userId) === id);
}
