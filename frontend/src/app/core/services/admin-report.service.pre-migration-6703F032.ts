import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type AdminReportType = 'BY_CHURCH' | 'BY_MONTH' | 'BY_SERVICE';

export interface PaidMemberReportRow {
  userId: string;
  memberName: string;
  telephoneNumber: string;
  churchId: string;
  churchName: string;
  branchName: string;
  serviceCode: string;
  serviceName: string;
  planLabel: string;
  amountCents: number;
  paidAt: string;
  paidMonth: string;
  paymentStatus: 'PAID';
}

export interface PaidMemberReport {
  reportType: AdminReportType;
  generatedAt: string;
  filters: {
    month: string;
    churchId: string;
    serviceCode: string;
  };
  totalMembers: number;
  totalPayments: number;
  totalAmountCents: number;
  rows: PaidMemberReportRow[];
}

export interface PaidMemberReportFilters {
  reportType: AdminReportType;
  month?: string;
  churchId?: string;
  serviceCode?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminReportService {
  private readonly http = inject(HttpClient);

  createPaidMemberReport(
    filters: PaidMemberReportFilters
  ): Observable<PaidMemberReport> {
    let params = new HttpParams().set('reportType', filters.reportType);
    if (filters.month) params = params.set('month', filters.month);
    if (filters.churchId) params = params.set('churchId', filters.churchId);
    if (filters.serviceCode) {
      params = params.set('serviceCode', filters.serviceCode);
    }
    return this.http.get<PaidMemberReport>(
      '/api/platform/admin/reports/paid-members',
      { params }
    );
  }
}
