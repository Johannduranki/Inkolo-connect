import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MemberDocument } from '../models/member-document.model';

@Injectable({ providedIn: 'root' })
export class ServiceProviderDocumentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform';

  uploadMemberPolicyDocument(
    memberId: string,
    serviceId: string,
    file: File
  ): Observable<MemberDocument> {
    const formData = new FormData();
    formData.append('memberId', memberId);
    formData.append('serviceId', serviceId);
    formData.append('serviceProviderId', 'sp-001');
    formData.append('documentType', 'FUNERAL_COVER_POLICY');
    formData.append('file', file);
    return this.http.post<MemberDocument>(
      `${this.apiUrl}/service-provider/documents`,
      formData
    );
  }

  getMemberDocuments(memberId: string): Observable<MemberDocument[]> {
    return this.http.get<MemberDocument[]>(
      `${this.apiUrl}/member-documents/me`
    );
  }

  getMemberDocumentsForAdmin(
    memberId: string
  ): Observable<MemberDocument[]> {
    return this.http.get<MemberDocument[]>(
      `${this.apiUrl}/admin/users/${memberId}/documents`
    );
  }

  getDocumentsByServiceProvider(serviceProviderId: string): Observable<MemberDocument[]> {
    return this.http.get<MemberDocument[]>(
      `${this.apiUrl}/service-provider/documents`,
      { params: { serviceProviderId } }
    );
  }

  canServiceProviderUploadDocument(
    serviceProviderId: string,
    memberId: string,
    serviceId: string
  ): boolean {
    return serviceProviderId === 'sp-001' && memberId.length > 0 && serviceId === 'funeral-cover-001';
  }
}
