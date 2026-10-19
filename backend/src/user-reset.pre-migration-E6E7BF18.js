import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { getPool } from './database.js';
import { updatePlatformState } from './platform-store.js';

const memberDocumentDirectory = path.resolve('uploads/member-documents');

function deleteMemberDocumentFiles(documents) {
  for (const document of documents) {
    const fileName = path.basename(String(document.fileUrl ?? ''));
    if (!fileName) continue;
    const filePath = path.resolve(memberDocumentDirectory, fileName);
    if (
      filePath.startsWith(`${memberDocumentDirectory}${path.sep}`) &&
      existsSync(filePath)
    ) {
      unlinkSync(filePath);
    }
  }
}

export async function resetUserServiceData(userId, databaseAvailable) {
  const normalizedUserId = String(userId);
  const summary = {
    subscriptionsDeleted: 0,
    applicationsDeleted: 0,
    agreementsDeleted: 0,
    documentsDeleted: 0
  };

  if (databaseAvailable) {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
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
  const platformSummary = updatePlatformState((state) => {
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

    return {
      subscriptionsDeleted: subscriptions.length - keptSubscriptions.length,
      agreementsDeleted: agreements.length - keptAgreements.length,
      documentsDeleted: documents.length - keptDocuments.length
    };
  });

  deleteMemberDocumentFiles(removedDocuments);
  summary.subscriptionsDeleted += platformSummary.subscriptionsDeleted;
  summary.agreementsDeleted += platformSummary.agreementsDeleted;
  summary.documentsDeleted += platformSummary.documentsDeleted;
  return summary;
}
