import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
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
export class MyDocumentsComponent implements OnChanges {
  private readonly documentsService = inject(ServiceProviderDocumentService);
  private readonly agreementsService = inject(LegalAgreementService);

  @Input({ required: true }) memberId!: number;
  readonly activeFolder = signal<'terms' | 'policies'>('terms');
  readonly documents = signal<MemberDocument[]>([]);
  readonly agreements = signal<LegalAgreementEvidence[]>([]);

  ngOnChanges(): void {
    if (!this.memberId) return;
    this.documentsService
      .getMemberDocuments(String(this.memberId))
      .subscribe((documents) => this.documents.set(documents));
    this.agreementsService
      .getMyAgreements()
      .subscribe((agreements) => this.agreements.set(agreements));
  }

  viewAgreement(agreement: LegalAgreementEvidence): void {
    this.agreementsService.getAgreementDocument(agreement.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  downloadEvidence(agreement: LegalAgreementEvidence): void {
    this.agreementsService
      .getAgreementEvidenceFile(agreement.id)
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${agreement.serviceCode}-acceptance-${agreement.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
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
