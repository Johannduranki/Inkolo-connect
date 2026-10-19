import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../auth.service';
import { RoleService } from '../../core/services/role.service';
import { RoleSwitcherComponent } from '../../shared/components/role-switcher/role-switcher.component';
import { AccountingService } from './accounting.service';

type AccountingView = 'overview' | 'receivables' | 'payables' | 'employees' | 'payments' | 'invoices' | 'ledger' | 'statements' | 'loans' | 'reconciliation' | 'funds' | 'codes';
type LedgerType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
type EntryStatus = 'Posted' | 'Pending' | 'Overdue' | 'Matched';

interface LedgerEntry {
  id: string;
  date: string;
  reference: string;
  entity: string;
  account: string;
  type: LedgerType;
  description: string;
  debit: number;
  credit: number;
  status: EntryStatus;
}

interface OpenItem {
  id: string;
  counterparty: string;
  entity: string;
  dueDate: string;
  reference: string;
  amount: number;
  status: 'Current' | 'Due soon' | 'Overdue' | 'Paid';
}

interface Loan {
  lender: string;
  purpose: string;
  principal: number;
  outstanding: number;
  rate: number;
  instalment: number;
  nextPayment: string;
}

interface EmployeeCost {
  id: string;
  fullName: string;
  employeeNumber: string;
  role: string;
  entity: string;
  grossSalary: number;
  employerUif: number;
  sdl: number;
  pension: number;
  medicalAid: number;
  status: 'Active' | 'Inactive';
}

interface SupplierInvoice {
  id: string;
  supplier: string;
  entity: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  fileName: string;
  status: 'Uploaded' | 'Approved' | 'Paid';
}

interface TenantInvoice {
  id: string;
  tenant: string;
  invoiceNumber: string;
  period: string;
  issueDate: string;
  dueDate: string;
  subscriptionFee: number;
  serviceFees: number;
  vat: number;
  total: number;
  status: 'Draft' | 'Issued' | 'Paid';
}

interface FundMovement {
  id: string;
  date: string;
  reference: string;
  source: string;
  destination: string;
  category: string;
  amount: number;
  bankReference: string;
  status: 'Unmatched' | 'Partially matched' | 'Reconciled';
}

interface ScopeCode {
  id: string;
  scopeType: 'PLATFORM' | 'TENANT' | 'COMMUNITY' | 'SERVICE_PROVIDER';
  scopeId: string;
  name: string;
  shortCode: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface AccountingPayment {
  id: string;
  paymentDate: string;
  sourceScopeCode: string;
  sourceName: string;
  destinationScopeCode: string;
  destinationName: string;
  destinationType: string;
  amount: number;
  currency: string;
  purpose: string;
  paymentReference: string;
  paymentMethod: string;
  status: 'Recorded' | 'Failed' | 'Reversed';
}

@Component({
  selector: 'app-accounting-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, RoleSwitcherComponent],
  templateUrl: './accounting-dashboard.component.html',
  styleUrls: ['./accounting-dashboard.component.css', './accounting-dashboard-extensions.component.css']
})
export class AccountingDashboardComponent implements OnDestroy {
  private snapshotRequest?: Subscription;
  private revision = 0;
  readonly loadError = signal('');
  readonly loading = signal(false);
  private readonly auth = inject(AuthService);
  private readonly roles = inject(RoleService);
  private readonly router = inject(Router);
  private readonly accounting = inject(AccountingService);

  readonly user = signal<User | null>(null);
  readonly activeView = signal<AccountingView>('overview');
  readonly selectedEntity = signal('All entities');
  readonly selectedPeriod = signal('All recorded dates');
  readonly notice = signal('');
  readonly showJournal = signal(false);
  readonly showEmployeeForm = signal(false);
  readonly showTenantInvoiceForm = signal(false);
  readonly showCodeForm = signal(false);
  get entities(): string[] { return ['All entities', ...new Set(['Duranki Platform', ...this.scopeCodes().map(scope => scope.name)])]; }
  readonly periods = ['All recorded dates'];

  journal = { date: '2026-08-31', reference: '', account: 'Bank', description: '', debit: 0, credit: 0, entity: 'Duranki Platform' };
  employeeForm = { fullName: '', employeeNumber: '', role: '', entity: 'Duranki Platform', grossSalary: 0, employerUif: 0, sdl: 0, pension: 0, medicalAid: 0 };
  supplierInvoiceForm = { supplier: '', entity: 'Duranki Platform', invoiceNumber: '', invoiceDate: '2026-08-31', dueDate: '2026-09-30', amount: 0, fileName: '' };
  tenantInvoiceForm = { tenant: 'Inkolo', period: 'September 2026', issueDate: '2026-09-01', dueDate: '2026-09-30', subscriptionFee: 0, serviceFees: 0, vatRate: 15 };
  paymentForm = { paymentDate: '2026-08-31', sourceScopeCode: 'DUR', sourceName: 'Duranki Platform', destinationScopeCode: '', amount: 0, purpose: '', paymentReference: '', paymentMethod: 'Bank transfer' };
  codeForm: { scopeType: ScopeCode['scopeType']; scopeId: string; name: string; shortCode: string } = { scopeType: 'TENANT', scopeId: '', name: '', shortCode: '' };
  selectedInvoiceFile: File | null = null;
  reconciliationReferences: Record<string, string> = {};
  employeeUploadName = '';
  readonly employeeUploadRows = signal<Omit<EmployeeCost, 'id' | 'status'>[]>([]);

  readonly ledgerEntries = signal<LedgerEntry[]>([]);

  readonly receivables = signal<OpenItem[]>([]);

  readonly payables = signal<OpenItem[]>([]);

  readonly loans = signal<Loan[]>([]);

  readonly employees = signal<EmployeeCost[]>([]);

  readonly supplierInvoices = signal<SupplierInvoice[]>([]);

  readonly tenantInvoices = signal<TenantInvoice[]>([]);

  readonly fundMovements = signal<FundMovement[]>([]);
  readonly scopeCodes = signal<ScopeCode[]>([]);
  readonly payments = signal<AccountingPayment[]>([]);
  readonly scopeCodeTypes: ScopeCode['scopeType'][] = ['TENANT', 'COMMUNITY', 'SERVICE_PROVIDER'];

  readonly filteredLedger = computed(() => this.ledgerEntries().filter((entry) => this.selectedEntity() === 'All entities' || entry.entity === this.selectedEntity()));
  readonly income = computed(() => this.filteredLedger().filter(({ type }) => type === 'Income').reduce((sum, item) => sum + item.credit, 0));
  readonly expenses = computed(() => this.filteredLedger().filter(({ type }) => type === 'Expense').reduce((sum, item) => sum + item.debit, 0));
  readonly profit = computed(() => this.income() - this.expenses());
  readonly cash = computed(() =>  this.filteredLedger().filter(({ account }) => account === 'Bank').reduce((sum, item) => sum + item.debit - item.credit, 0));
  readonly totalReceivable = computed(() => this.receivables().filter(({ status }) => status !== 'Paid').reduce((sum, item) => sum + item.amount, 0));
  readonly totalPayable = computed(() => this.payables().filter(({ status }) => status !== 'Paid').reduce((sum, item) => sum + item.amount, 0));
  readonly loanOutstanding = computed(() => this.loans().reduce((sum, loan) => sum + loan.outstanding, 0));
  readonly loanPrincipal = computed(() => this.loans().reduce((sum, loan) => sum + loan.principal, 0));
  readonly loanInstalments = computed(() => this.loans().reduce((sum, loan) => sum + loan.instalment, 0));
  readonly ledgerDebitTotal = computed(() => this.filteredLedger().reduce((sum, entry) => sum + entry.debit, 0));
  readonly ledgerCreditTotal = computed(() => this.filteredLedger().reduce((sum, entry) => sum + entry.credit, 0));
  readonly openItemCount = computed(() => (this.activeView() === 'receivables' ? this.receivables() : this.payables()).filter(({ status }) => status !== 'Paid').length);
  readonly overdueItemCount = computed(() => (this.activeView() === 'receivables' ? this.receivables() : this.payables()).filter(({ status }) => status === 'Overdue').length);
  readonly unmatchedLedger = computed(() => this.filteredLedger().filter(({ status }) => status !== 'Matched'));
  readonly assets = computed(() => this.cash() + this.totalReceivable() );
  readonly liabilities = computed(() => this.totalPayable() + this.loanOutstanding());
  readonly equity = computed(() => this.assets() - this.liabilities());
  readonly reconciliationTotal = computed(() => this.filteredLedger().filter(({ status }) => status === 'Matched').reduce((sum, item) => sum + item.debit - item.credit, 0));
  readonly monthlyPayrollCost = computed(() => this.employees().filter(({ status }) => status === 'Active').reduce((sum, employee) => sum + this.employeeTotalCost(employee), 0));
  readonly employeeGrossPay = computed(() => this.employees().filter(({ status }) => status === 'Active').reduce((sum, employee) => sum + employee.grossSalary, 0));
  readonly uploadedInvoiceTotal = computed(() => this.supplierInvoices().reduce((sum, invoice) => sum + invoice.amount, 0));
  readonly tenantInvoiceTotal = computed(() => this.tenantInvoices().reduce((sum, invoice) => sum + invoice.total, 0));
  readonly fundMovementTotal = computed(() => this.fundMovements().reduce((sum, movement) => sum + movement.amount, 0));
  readonly unreconciledFundTotal = computed(() => this.fundMovements().filter(({ status }) => status !== 'Reconciled').reduce((sum, movement) => sum + movement.amount, 0));
  readonly reconciledFundCount = computed(() => this.fundMovements().filter(({ status }) => status === 'Reconciled').length);
  readonly tenantCodeCount = computed(() => this.scopeCodes().filter(({ scopeType }) => scopeType === 'TENANT').length);
  readonly communityCodeCount = computed(() => this.scopeCodes().filter(({ scopeType }) => scopeType === 'COMMUNITY').length);
  readonly providerCodeCount = computed(() => this.scopeCodes().filter(({ scopeType }) => scopeType === 'SERVICE_PROVIDER').length);
  readonly paymentTotal = computed(() => this.payments().filter(({ status }) => status === 'Recorded').reduce((sum, payment) => sum + payment.amount, 0));
  readonly viewTitle = computed(() => ({
    overview: 'Financial overview', receivables: 'Accounts receivable', payables: 'Accounts payable',
    employees: 'Employees and payroll costs', payments: 'Payments', invoices: 'Invoice management', ledger: 'General ledger',
    statements: 'Financial statements', loans: 'Loans and finance', reconciliation: 'Bank reconciliation',
    funds: 'Movement of funds', codes: 'Accounting short codes'
  })[this.activeView()]);

  constructor() {
    this.auth.getProfile().subscribe({ next: (user) => this.user.set(user), error: () => this.logout() });
    this.loadAccountingData();
  }

  selectView(view: AccountingView): void { this.activeView.set(view); }
  changeEntity(value: string): void { this.selectedEntity.set(value); }
  changePeriod(value: string): void { this.selectedPeriod.set(value); }

  postJournal(): void {
    if (!this.journal.reference.trim() || !this.journal.description.trim() || (this.journal.debit <= 0 && this.journal.credit <= 0)) {
      this.flash('Enter a reference, description, and debit or credit amount.');
      return;
    }
    const request = { ...this.journal, scopeCode: this.scopeCodeFor(this.journal.entity), type: this.journal.account === 'Bank' ? 'Asset' : 'Expense' };
    this.accounting.createLedgerEntry<LedgerEntry>(request).subscribe({
      next: (entry) => {
        this.ledgerEntries.update((entries) => [entry, ...entries]);
        this.journal = { date: '2026-08-31', reference: '', account: 'Bank', description: '', debit: 0, credit: 0, entity: 'Duranki Platform' };
        this.showJournal.set(false);
        this.flash('Journal entry saved permanently to the general ledger.');
      },
      error: (error) => this.flash(error.error?.message ?? 'The journal entry could not be saved.')
    });
  }

  markPaid(kind: 'receivable' | 'payable', item: OpenItem): void {
    this.flash('Payment verification is not connected. No payment status has been changed.');
  }

  matchEntry(entry: LedgerEntry): void {
    this.flash('Bank-statement matching is not connected. No reconciliation has been recorded.');
  }

  employeeTotalCost(employee: Pick<EmployeeCost, 'grossSalary' | 'employerUif' | 'sdl' | 'pension' | 'medicalAid'>): number {
    return employee.grossSalary + employee.employerUif + employee.sdl + employee.pension + employee.medicalAid;
  }

  addEmployee(): void {
    if (!this.employeeForm.fullName.trim() || !this.employeeForm.employeeNumber.trim() || !this.employeeForm.role.trim() || this.employeeForm.grossSalary <= 0) {
      this.flash('Complete the employee name, number, role and gross salary.');
      return;
    }
    this.accounting.createEmployee<EmployeeCost>({ ...this.employeeForm, scopeCode: this.scopeCodeFor(this.employeeForm.entity) }).subscribe({
      next: (employee) => {
        this.employees.update((items) => [...items, employee]);
        this.employeeForm = { fullName: '', employeeNumber: '', role: '', entity: 'Duranki Platform', grossSalary: 0, employerUif: 0, sdl: 0, pension: 0, medicalAid: 0 };
        this.showEmployeeForm.set(false);
        this.flash('Employee and monthly employer costs saved permanently.');
      },
      error: (error) => this.flash(error.error?.message ?? 'The employee could not be saved.')
    });
  }

  captureEmployeeUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.employeeUploadName = file?.name ?? '';
    this.employeeUploadRows.set([]);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result ?? '').split(/\r?\n/).filter((line) => line.trim());
        const headers = this.parseCsvRow(lines.shift() ?? '').map((header) => header.trim());
        const required = ['fullName', 'employeeNumber', 'role', 'entity', 'grossSalary'];
        if (required.some((header) => !headers.includes(header))) throw new Error('Missing columns');
        const rows = lines.map((line) => {
          const values = this.parseCsvRow(line);
          const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
          return {
            fullName: record['fullName'], employeeNumber: record['employeeNumber'], role: record['role'],
            entity: record['entity'], scopeCode: record['scopeCode'] || this.scopeCodeFor(record['entity']),
            grossSalary: Number(record['grossSalary']), employerUif: Number(record['employerUif'] || 0),
            sdl: Number(record['sdl'] || 0), pension: Number(record['pension'] || 0), medicalAid: Number(record['medicalAid'] || 0)
          } as Omit<EmployeeCost, 'id' | 'status'>;
        });
        this.employeeUploadRows.set(rows);
        this.flash(`${rows.length} employee rows ready to upload.`);
      } catch {
        this.flash('Use the Duranki employee CSV column format shown below.');
      }
    };
    reader.readAsText(file);
  }

  uploadEmployees(): void {
    const rows = this.employeeUploadRows();
    if (!rows.length) { this.flash('Select a valid employee CSV file first.'); return; }
    this.accounting.uploadEmployees<{ created: EmployeeCost[]; createdCount: number; skippedCount: number }>(rows).subscribe({
      next: (result) => {
        this.employees.update((items) => [...items, ...result.created]);
        this.employeeUploadRows.set([]);
        this.employeeUploadName = '';
        this.flash(`${result.createdCount} employees saved; ${result.skippedCount} existing rows skipped.`);
      },
      error: (error) => this.flash(error.error?.message ?? 'The employee file could not be uploaded.')
    });
  }

  downloadEmployeeTemplate(): void {
    const csv = 'fullName,employeeNumber,role,entity,scopeCode,grossSalary,employerUif,sdl,pension,medicalAid\nNomsa Dube,DUR-1001,Finance Manager,Duranki Platform,DUR,52000,177.12,520,3900,2200';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'duranki-employee-upload-template.csv'; link.click(); URL.revokeObjectURL(url);
  }

  createPayment(): void {
    const form = this.paymentForm;
    if (!form.destinationScopeCode || form.amount <= 0 || !form.purpose.trim() || !form.paymentReference.trim()) {
      this.flash('Choose a destination and enter the amount, purpose and payment reference.');
      return;
    }
    this.accounting.createPayment<AccountingPayment>(form).subscribe({
      next: (payment) => {
        this.payments.update((items) => [payment, ...items]);
        this.paymentForm = { paymentDate: '2026-08-31', sourceScopeCode: 'DUR', sourceName: 'Duranki Platform', destinationScopeCode: '', amount: 0, purpose: '', paymentReference: '', paymentMethod: 'Bank transfer' };
        this.loadAccountingData();
        this.flash(`Payment ${payment.paymentReference} recorded and reconciled.`);
      },
      error: (error) => this.flash(error.error?.message ?? 'The payment could not be recorded.')
    });
  }

  captureInvoiceFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.selectedInvoiceFile = file ?? null;
    this.supplierInvoiceForm.fileName = file?.name ?? '';
  }

  uploadSupplierInvoice(): void {
    const form = this.supplierInvoiceForm;
    if (!form.supplier.trim() || !form.invoiceNumber.trim() || form.amount <= 0 || !form.fileName || !this.selectedInvoiceFile) {
      this.flash('Enter the supplier, invoice number and amount, then select the invoice file.');
      return;
    }
    this.accounting.uploadSupplierInvoice<SupplierInvoice>({ ...form, scopeCode: this.scopeCodeFor(form.entity) }, this.selectedInvoiceFile).subscribe({
      next: (invoice) => {
        this.supplierInvoices.update((items) => [...items, invoice]);
        this.payables.update((items) => [...items, { id: `AP-${1050 + items.length}`, counterparty: form.supplier, entity: form.entity, dueDate: form.dueDate, reference: form.invoiceNumber, amount: Number(form.amount), status: 'Current' }]);
        this.supplierInvoiceForm = { supplier: '', entity: 'Duranki Platform', invoiceNumber: '', invoiceDate: '2026-08-31', dueDate: '2026-09-30', amount: 0, fileName: '' };
        this.selectedInvoiceFile = null;
        this.loadAccountingData();
        this.flash('Invoice file saved and added to the permanent accounting register.');
      },
      error: (error) => this.flash(error.error?.message ?? 'The invoice could not be uploaded.')
    });
  }

  createTenantInvoice(): void {
    const form = this.tenantInvoiceForm;
    if (!form.tenant || form.subscriptionFee < 0 || form.serviceFees < 0 || form.subscriptionFee + form.serviceFees <= 0) {
      this.flash('Choose a tenant and enter a subscription or service fee.');
      return;
    }
    this.accounting.createTenantInvoice<TenantInvoice>({ ...form, scopeCode: this.scopeCodeFor(form.tenant) }).subscribe({
      next: (invoice) => {
        this.tenantInvoices.update((items) => [...items, invoice]);
        this.receivables.update((items) => [...items, { id: `AR-${2042 + items.length}`, counterparty: invoice.tenant, entity: 'Duranki Platform', dueDate: invoice.dueDate, reference: invoice.invoiceNumber, amount: invoice.total, status: 'Current' }]);
        this.showTenantInvoiceForm.set(false);
        this.flash(`${invoice.invoiceNumber} saved and added to accounts receivable.`);
      },
      error: (error) => this.flash(error.error?.message ?? 'The tenant invoice could not be created.')
    });
  }

  reconcileFund(movement: FundMovement): void {
    const bankReference = String(this.reconciliationReferences[movement.id] ?? movement.bankReference ?? '').trim();
    if (!bankReference) { this.flash('Enter the bank reference before reconciling this movement.'); return; }
    this.accounting.reconcileFund<FundMovement>(movement.id, bankReference).subscribe({
      next: (updated) => {
        this.fundMovements.update((items) => items.map((item) => item.id === movement.id ? updated : item));
        this.flash(`${movement.reference} permanently reconciled.`);
      },
      error: (error) => this.flash(error.error?.message ?? 'The movement could not be reconciled.')
    });
  }

  createScopeCode(): void {
    this.accounting.createScopeCode<ScopeCode>(this.codeForm).subscribe({
      next: (code) => {
        this.scopeCodes.update((codes) => [...codes, code]);
        this.codeForm = { scopeType: 'TENANT', scopeId: '', name: '', shortCode: '' };
        this.showCodeForm.set(false);
        this.flash(`${code.shortCode} created.`);
      },
      error: (error) => this.flash(error.error?.message ?? 'The short code could not be created.')
    });
  }

  private loadAccountingData(): void {
    this.snapshotRequest?.unsubscribe();
    const revision = ++this.revision, token = this.auth.getToken();
    this.clearSnapshot(); this.loadError.set(''); this.loading.set(true);
    this.snapshotRequest = this.accounting.getSnapshot<EmployeeCost, SupplierInvoice, TenantInvoice, LedgerEntry, FundMovement, ScopeCode, AccountingPayment>().subscribe({
      next: (snapshot) => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.mergeById(this.employees, snapshot.employees);
        this.mergeById(this.supplierInvoices, snapshot.supplierInvoices);
        this.mergeById(this.tenantInvoices, snapshot.tenantInvoices);
        this.mergeById(this.ledgerEntries, snapshot.ledgerEntries, true);
        this.mergeById(this.fundMovements, snapshot.fundMovements, true);
        this.scopeCodes.set(snapshot.scopeCodes);
        this.mergeById(this.payments, snapshot.payments, true);
        this.loading.set(false);
      },
      error: () => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.loading.set(false); this.clearSnapshot();
        this.loadError.set('Accounting data is unavailable. No verified balances can be displayed.');
      }
    });
  }

  private clearSnapshot(): void {
    this.employees.set([]); this.supplierInvoices.set([]); this.tenantInvoices.set([]);
    this.ledgerEntries.set([]); this.fundMovements.set([]); this.scopeCodes.set([]); this.payments.set([]);
  }
  ngOnDestroy(): void { this.revision++; this.snapshotRequest?.unsubscribe(); this.clearSnapshot(); }

  private mergeById<T extends { id: string }>(target: { set(value: T[]): void; (): T[] }, incoming: T[], prepend = false): void {
    const existing = target();
    const existingIds = new Set(existing.map(({ id }) => id));
    const unique = incoming.filter(({ id }) => !existingIds.has(id));
    target.set(prepend ? [...unique, ...existing] : [...existing, ...unique]);
  }

  private scopeCodeFor(name: string): string {
    return this.scopeCodes().find((scope) => scope.name === name)?.shortCode ?? (name === 'Duranki Platform' ? 'DUR' : 'TEN-UNK');
  }

  private parseCsvRow(line: string): string[] {
    const values: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === ',' && !quoted) { values.push(value.trim()); value = ''; }
      else value += character;
    }
    values.push(value.trim());
    return values;
  }

  exportLedger(): void {
    const rows = [['Date','Reference','Entity','Account','Description','Debit','Credit','Status'], ...this.filteredLedger().map((e) => [e.date,e.reference,e.entity,e.account,e.description,e.debit,e.credit,e.status])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'duranki-general-ledger.csv'; link.click(); URL.revokeObjectURL(url);
    this.flash('General ledger CSV downloaded.');
  }

  logout(): void { this.auth.logout(); void this.router.navigate(['/login']); }
  private flash(message: string): void { this.notice.set(message); window.setTimeout(() => this.notice.set(''), 3200); }
}
