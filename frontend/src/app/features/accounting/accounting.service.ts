import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AccountingSnapshot<TEmployee, TSupplierInvoice, TTenantInvoice, TLedger, TFund, TScope, TPayment> {
  employees: TEmployee[];
  supplierInvoices: TSupplierInvoice[];
  tenantInvoices: TTenantInvoice[];
  ledgerEntries: TLedger[];
  fundMovements: TFund[];
  scopeCodes: TScope[];
  payments: TPayment[];
}

@Injectable({ providedIn: 'root' })
export class AccountingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/accounting';

  getSnapshot<TEmployee, TSupplierInvoice, TTenantInvoice, TLedger, TFund, TScope, TPayment>(): Observable<AccountingSnapshot<TEmployee, TSupplierInvoice, TTenantInvoice, TLedger, TFund, TScope, TPayment>> {
    return this.http.get<AccountingSnapshot<TEmployee, TSupplierInvoice, TTenantInvoice, TLedger, TFund, TScope, TPayment>>(this.apiUrl);
  }

  createEmployee<T>(employee: object): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/employees`, employee);
  }

  uploadEmployees<T>(employees: object[]): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/employees/bulk`, { employees });
  }

  createPayment<T>(payment: object): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/payments`, payment);
  }

  uploadSupplierInvoice<T>(invoice: object, file: File): Observable<T> {
    const body = new FormData();
    Object.entries(invoice).forEach(([key, value]) => body.append(key, String(value ?? '')));
    body.append('invoice', file);
    return this.http.post<T>(`${this.apiUrl}/supplier-invoices`, body);
  }

  createTenantInvoice<T>(invoice: object): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/tenant-invoices`, invoice);
  }

  createLedgerEntry<T>(entry: object): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/ledger-entries`, entry);
  }

  reconcileFund<T>(movementId: string, bankReference: string): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}/fund-movements/${movementId}/reconcile`, { bankReference });
  }

  createScopeCode<T>(scope: object): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/scope-codes`, scope);
  }
}
