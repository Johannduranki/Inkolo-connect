import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { MemberDocument } from '../models/member-document.model';

export interface ProviderScope {
  serviceProviderId: string;
  tenantId: string;
  communityId: string;
  tenantName: string;
  communityName: string;
  serviceCodes: string[];
}

export interface ProviderWorkspace {
  scopes: ProviderScope[];
  documents: MemberDocument[];
}

@Injectable({ providedIn: 'root' })
export class ServiceProviderDocumentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform';

  uploadMemberPolicyDocument(
    memberId: string,
    serviceId: string,
    file: File,
    scope: ProviderScope
  ): Observable<MemberDocument> {
    const formData = new FormData();
    formData.append('memberId', memberId);
    formData.append('serviceId', serviceId);
    formData.append('serviceProviderId', scope.serviceProviderId);
    formData.append('tenantId', scope.tenantId);
    formData.append('communityId', scope.communityId);
    formData.append('documentType', serviceId === 'funeral-cover' ? 'FUNERAL_COVER_POLICY' : 'SERVICE_AGREEMENT');
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

  getWorkspace(): Observable<ProviderWorkspace> {
    return this.http.get<ProviderWorkspace>(`${this.apiUrl}/service-provider/workspace`);
  }

  download(document: MemberDocument): Observable<Blob> {
    // Never attach credentials to a URL supplied by an external document record.
    if (!/^\/uploads\/member-documents\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(document.fileUrl)) {
      return throwError(() => new Error('Invalid document location.'));
    }
    return this.http.get(document.fileUrl, { responseType: 'blob' });
  }
}
