import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { MemberDocument } from '../models/member-document.model';

@Injectable({ providedIn: 'root' })
export class ServiceProviderDocumentService {
  private readonly documents = new BehaviorSubject<MemberDocument[]>([
    {
      id: 'doc-001',
      memberId: '1',
      serviceProviderId: 'sp-001',
      serviceId: 'funeral-cover-001',
      policyNumber: 'POL-DEMO-0001',
      documentType: 'FUNERAL_COVER_POLICY',
      fileName: 'african-bank-funeral-policy.pdf',
      fileUrl: '#',
      uploadedAt: '2026-06-09',
      uploadedBy: 'African Bank Funeral Cover',
      status: 'ACTIVE',
      expiryDate: '2027-06-09'
    }
  ]);

  uploadMemberPolicyDocument(
    memberId: string,
    serviceId: string,
    file: File
  ): Observable<MemberDocument> {
    const document: MemberDocument = {
      id: `doc-${Date.now()}`,
      memberId,
      serviceProviderId: 'sp-001',
      serviceId,
      policyNumber: `POL-${Date.now()}`,
      documentType: 'FUNERAL_COVER_POLICY',
      fileName: file.name,
      fileUrl: '#',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'African Bank Funeral Cover',
      status: 'ACTIVE'
    };
    this.documents.next([document, ...this.documents.value]);
    return of(document);
  }

  replaceMemberPolicyDocument(documentId: string, file: File): Observable<MemberDocument | undefined> {
    let updated: MemberDocument | undefined;
    this.documents.next(this.documents.value.map((document) => {
      if (document.id !== documentId) {
        return document;
      }
      updated = { ...document, fileName: file.name, uploadedAt: new Date().toISOString() };
      return updated;
    }));
    return of(updated);
  }

  getMemberDocuments(memberId: string): Observable<MemberDocument[]> {
    return new Observable((subscriber) => {
      const subscription = this.documents.subscribe((documents) =>
        subscriber.next(documents.filter((document) => document.memberId === memberId))
      );
      return () => subscription.unsubscribe();
    });
  }

  getDocumentsByServiceProvider(serviceProviderId: string): Observable<MemberDocument[]> {
    return new Observable((subscriber) => {
      const subscription = this.documents.subscribe((documents) =>
        subscriber.next(
          documents.filter((document) => document.serviceProviderId === serviceProviderId)
        )
      );
      return () => subscription.unsubscribe();
    });
  }

  canServiceProviderUploadDocument(
    serviceProviderId: string,
    memberId: string,
    serviceId: string
  ): boolean {
    return serviceProviderId === 'sp-001' && memberId.length > 0 && serviceId === 'funeral-cover-001';
  }
}
