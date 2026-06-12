import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LegalAgreementEvidence {
  id: string;
  userId: string;
  memberName: string;
  memberTelephone: string | null;
  memberEmail: string | null;
  serviceCode: string;
  serviceName: string;
  planCode: string;
  documentTitle: string;
  documentVersion: string;
  documentSha256: string;
  documentMimeType: string;
  documentSourceFile: string | null;
  consentStatement: string;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable({ providedIn: 'root' })
export class LegalAgreementService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform';

  getMyAgreements(): Observable<LegalAgreementEvidence[]> {
    return this.http.get<LegalAgreementEvidence[]>(
      `${this.apiUrl}/agreements/me`
    );
  }

  getMemberAgreements(
    userId: number
  ): Observable<LegalAgreementEvidence[]> {
    return this.http.get<LegalAgreementEvidence[]>(
      `${this.apiUrl}/admin/users/${userId}/agreements`
    );
  }

  getAgreementDocument(agreementId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/agreements/${agreementId}/document`,
      { responseType: 'blob' }
    );
  }

  getAgreementEvidenceFile(agreementId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/agreements/${agreementId}/evidence`,
      { responseType: 'blob' }
    );
  }
}
