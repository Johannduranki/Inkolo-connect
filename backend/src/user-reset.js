import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { getPool } from './database.js';
import { readPlatformState, updatePlatformState } from './platform-store.js';
import { platformAdmin } from './tenant-access.js';

const memberDocumentDirectory = path.resolve('uploads/member-documents');

export function removableMemberDocumentPaths(documents,retainedDocuments) {
  const retainedNames=new Set(retainedDocuments.map(document=>path.basename(String(document.fileUrl??''))));
  const files=new Set();
  for (const document of documents) {
    const fileName = path.basename(String(document.fileUrl ?? ''));
    if (!fileName || retainedNames.has(fileName)) continue;
    const filePath = path.resolve(memberDocumentDirectory, fileName);
    if(filePath.startsWith(`${memberDocumentDirectory}${path.sep}`))files.add(filePath);
  }
  return [...files];
}
function deleteMemberDocumentFiles(documents,retainedDocuments) {
  for(const filePath of removableMemberDocumentPaths(documents,retainedDocuments))if(existsSync(filePath))unlinkSync(filePath);
}

export function authorizeServiceReset(state,userId,actorId,mode) {
  const actor=state.users.find(user=>String(user.id)===String(actorId));
  if(actor?.status!=='active'||!['self','admin'].includes(mode)||
    (mode==='admin'?!platformAdmin(actor):String(actorId)!==String(userId))) {
    throw Object.assign(Error('You do not have permission to reset these services.'),{status:403});
  }
  if(!state.users.some(user=>String(user.id)===String(userId)))throw Object.assign(Error('User not found.'),{status:404});
}

export async function resetUserServiceData(userId, databaseAvailable, {actorId,mode,readState=readPlatformState,updateState=updatePlatformState,sqlPool}={}) {
  authorizeServiceReset(readState(),userId,actorId,mode);
  const normalizedUserId = String(userId);
  const summary = {
    subscriptionsDeleted: 0,
    applicationsDeleted: 0,
    agreementsDeleted: 0,
    documentsDeleted: 0
  };

  if (databaseAvailable) {
    const connection = await (sqlPool||getPool()).getConnection();
    try {
      await connection.beginTransaction();
      authorizeServiceReset(readState(),userId,actorId,mode);
      const [applications] = await connection.execute(
        'DELETE FROM service_applications WHERE user_id = ?',
        [userId]
      );
      const [subscriptions] = await connection.execute(
        'DELETE FROM service_subscriptions WHERE user_id = ?',
        [userId]
      );
      const [agreements] = await connection.execute(
        'DELETE FROM legal_acceptances WHERE user_id = ?',
        [userId]
      );
      authorizeServiceReset(readState(),userId,actorId,mode);
      await connection.commit();
      summary.applicationsDeleted += applications.affectedRows ?? 0;
      summary.subscriptionsDeleted += subscriptions.affectedRows ?? 0;
      summary.agreementsDeleted += agreements.affectedRows ?? 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  const removedDocuments = [];
  const platformSummary = await updateState((state) => {
    authorizeServiceReset(state,userId,actorId,mode);
    const subscriptions = state.serviceSubscriptions ?? [];
    const agreements = state.legalAcceptances ?? [];
    const documents = state.memberDocuments ?? [];

    const keptSubscriptions = subscriptions.filter(
      ({ userId: subscriptionUserId }) =>
        String(subscriptionUserId) !== normalizedUserId
    );
    const keptAgreements = agreements.filter(
      ({ userId: agreementUserId }) =>
        String(agreementUserId) !== normalizedUserId
    );
    const keptDocuments = documents.filter((document) => {
      const belongsToUser =
        String(document.memberId) === normalizedUserId ||
        String(document.userId) === normalizedUserId;
      if (belongsToUser) removedDocuments.push(document);
      return !belongsToUser;
    });

    state.serviceSubscriptions = keptSubscriptions;
    state.legalAcceptances = keptAgreements;
    state.memberDocuments = keptDocuments;

    (state.securityAudit ??= []).push({action:'user.services.reset',actorId:String(actorId),targetId:normalizedUserId,mode,at:new Date().toISOString(),
      subscriptionsRemoved:subscriptions.length-keptSubscriptions.length,agreementsRemoved:agreements.length-keptAgreements.length,documentsRemoved:documents.length-keptDocuments.length});

    return {
      subscriptionsDeleted: subscriptions.length - keptSubscriptions.length,
      agreementsDeleted: agreements.length - keptAgreements.length,
      documentsDeleted: documents.length - keptDocuments.length
    };
  });

  deleteMemberDocumentFiles(removedDocuments,readState().memberDocuments??[]);
  summary.subscriptionsDeleted += platformSummary.subscriptionsDeleted;
  summary.agreementsDeleted += platformSummary.agreementsDeleted;
  summary.documentsDeleted += platformSummary.documentsDeleted;
  return summary;
}
