import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { Observable, Subscription, forkJoin } from 'rxjs';
import { AuthService } from '../../../auth.service';
import { MemberDocument } from '../../service-provider/models/member-document.model';
import { ServiceProviderDocumentService } from '../../service-provider/services/service-provider-document.service';
import {
  LegalAgreementEvidence,
  LegalAgreementService
} from '../../../core/services/legal-agreement.service';

@Component({
  selector: 'app-my-documents',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './my-documents.component.html',
  styleUrl: './my-documents.component.css'
})
export class MyDocumentsComponent implements OnChanges, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly documentsService = inject(ServiceProviderDocumentService);
  private readonly agreementsService = inject(LegalAgreementService);

  @Input({ required: true }) memberId!: number;
  readonly activeFolder = signal<'terms' | 'policies'>('terms');
  readonly documents = signal<MemberDocument[]>([]);
  readonly agreements = signal<LegalAgreementEvidence[]>([]);
  readonly error = signal('');
  readonly loading = signal(false);
  private requests = new Subscription();
  private revision = 0;

  ngOnChanges(): void {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    const revision = ++this.revision, token = this.auth.getToken();
    this.documents.set([]);
    this.agreements.set([]);
    this.error.set('');
    this.loading.set(false);
    if (!this.memberId) return;
    this.loading.set(true);
    this.requests.add(forkJoin({
      documents: this.documentsService.getMemberDocuments(String(this.memberId)),
      agreements: this.agreementsService.getMyAgreements()
    }).subscribe({
      next: result => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.documents.set(result.documents);
        this.agreements.set(result.agreements);
        this.loading.set(false);
      },
      error: () => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.loading.set(false);
        this.error.set('Your documents could not be loaded. Please try again.');
      }
    }));
  }

  viewAgreement(agreement: LegalAgreementEvidence): void {
    const extensions: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/html': 'html',
      'text/plain': 'txt'
    };
    this.downloadFile(this.agreementsService.getAgreementDocument(agreement.id), `${agreement.serviceCode}-terms.${extensions[agreement.documentMimeType] || 'bin'}`);
  }

  downloadEvidence(agreement: LegalAgreementEvidence): void {
    this.downloadFile(this.agreementsService.getAgreementEvidenceFile(agreement.id), `${agreement.serviceCode}-acceptance-${agreement.id}.json`);
  }

  downloadPolicy(document: MemberDocument): void {
    this.downloadFile(this.documentsService.download(document), document.fileName);
  }

  private downloadFile(request: Observable<Blob>, fileName: string): void {
    const revision = this.revision, token = this.auth.getToken();
    this.error.set('');
    this.requests.add(request.subscribe({
      next: blob => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.documents.set([]);
        this.agreements.set([]);
        this.error.set('File unavailable or access changed. Please refresh your documents.');
      }
    }));
  }

  ngOnDestroy(): void {
    this.revision++;
    this.requests.unsubscribe();
    this.documents.set([]);
    this.agreements.set([]);
  }

  policyTypeLabel(document: MemberDocument): string {
    const labels: Record<MemberDocument['documentType'], string> = {
      FUNERAL_COVER_POLICY: 'Funeral cover policy',
      INSURANCE_DOCUMENT: 'Insurance policy',
      SERVICE_AGREEMENT: 'Service policy document',
      INVOICE: 'Policy invoice',
      RECEIPT: 'Policy receipt',
      OTHER: 'Service document'
    };
    return labels[document.documentType];
  }
}
