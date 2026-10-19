import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService, User } from '../../../auth.service';
import { RoleSwitcherComponent } from '../../../shared/components/role-switcher/role-switcher.component';
import { MemberDocument } from '../models/member-document.model';
import { ProviderScope, ServiceProviderDocumentService } from '../services/service-provider-document.service';

@Component({
  selector: 'app-service-provider-dashboard',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, RoleSwitcherComponent],
  templateUrl: './service-provider-dashboard.component.html',
  styleUrl: './service-provider-dashboard.component.css'
})
export class ServiceProviderDashboardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly documentsService = inject(ServiceProviderDocumentService);
  private readonly subscriptions = new Subscription();
  private refreshSubscription?: Subscription;
  private revision = 0;
  readonly user = signal<User | null>(null);
  readonly scopes = signal<ProviderScope[]>([]);
  readonly documents = signal<MemberDocument[]>([]);
  readonly selectedScope = signal<ProviderScope | null>(null);
  readonly activeTab = signal('documents');
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly downloading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly memberId = new FormControl('', { nonNullable: true });
  readonly service = new FormControl('', { nonNullable: true });
  readonly search = new FormControl('', { nonNullable: true });

  ngOnInit(): void {
    const token = this.auth.getToken();
    this.subscriptions.add(this.auth.getProfile().subscribe({
      next: user => { if (this.auth.getToken() === token) this.user.set(user); },
      error: () => { if (this.auth.getToken() === token) this.logout(); }
    }));
    this.refresh();
  }

  refresh(): void {
    this.refreshSubscription?.unsubscribe();
    const revision = ++this.revision, token = this.auth.getToken(), previous = this.selectedScope();
    this.scopes.set([]);
    this.documents.set([]);
    this.selectedScope.set(null);
    this.error.set('');
    this.loading.set(true);
    this.refreshSubscription = this.documentsService.getWorkspace().subscribe({
      next: workspace => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.scopes.set(workspace.scopes);
        this.documents.set(workspace.documents);
        const index = workspace.scopes.findIndex(scope => this.sameScope(scope, previous));
        this.selectScope(String(index >= 0 ? index : 0));
        this.loading.set(false);
      },
      error: () => {
        if (revision !== this.revision || token !== this.auth.getToken()) return;
        this.loading.set(false);
        this.error.set('Provider workspace unavailable. Refresh to check your current access.');
      }
    });
  }

  sameScope(a: ProviderScope, b: ProviderScope | null): boolean {
    return !!b && a.serviceProviderId === b.serviceProviderId &&
      a.tenantId === b.tenantId && a.communityId === b.communityId;
  }

  scopeIndex(): string {
    return String(this.scopes().findIndex(scope => this.sameScope(scope, this.selectedScope())));
  }

  selectScope(index: string): void {
    const scope = this.scopes()[Number(index)] || null;
    this.selectedScope.set(scope);
    this.memberId.reset('');
    this.service.setValue(scope?.serviceCodes[0] || '');
    this.search.reset('');
    this.notice.set('');
  }

  visibleDocuments(): MemberDocument[] {
    const scope = this.selectedScope(), query = this.search.value.trim().toLowerCase();
    return scope ? this.documents().filter(document =>
      document.serviceProviderId === scope.serviceProviderId && document.tenantId === scope.tenantId &&
      document.communityId === scope.communityId &&
      (!query || document.fileName.toLowerCase().includes(query) || document.memberId.includes(query))
    ) : [];
  }

  upload(event: Event): void {
    const input = event.target as HTMLInputElement, file = input.files?.[0], scope = this.selectedScope();
    if (!file || !scope || this.uploading() || !this.memberId.value.trim() || !scope.serviceCodes.includes(this.service.value)) {
      input.value = '';
      return;
    }
    this.uploading.set(true);
    this.error.set('');
    const token = this.auth.getToken();
    this.subscriptions.add(this.documentsService.uploadMemberPolicyDocument(
      this.memberId.value.trim(), this.service.value, file, scope
    ).subscribe({
      next: () => {
        input.value = '';
        this.uploading.set(false);
        if (token !== this.auth.getToken()) return;
        this.refresh();
        this.notice.set('Document uploaded.');
      },
      error: () => {
        input.value = '';
        this.uploading.set(false);
        if (token !== this.auth.getToken()) return;
        this.documents.set([]);
        this.scopes.set([]);
        this.selectedScope.set(null);
        this.error.set('Upload rejected or unavailable. Refresh access before trying again.');
      }
    }));
  }

  download(document: MemberDocument): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.error.set('');
    const token = this.auth.getToken();
    this.subscriptions.add(this.documentsService.download(document).subscribe({
      next: blob => {
        this.downloading.set(false);
        if (token !== this.auth.getToken()) return;
        const url = URL.createObjectURL(blob), link = window.document.createElement('a');
        link.href = url;
        link.download = document.fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        this.downloading.set(false);
        if (token !== this.auth.getToken()) return;
        this.documents.set([]);
        this.scopes.set([]);
        this.selectedScope.set(null);
        this.error.set('Document unavailable or access changed. Refresh to check your permissions.');
      }
    }));
  }

  logout(): void {
    this.ngOnDestroy();
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.revision++;
    this.refreshSubscription?.unsubscribe();
    this.subscriptions.unsubscribe();
    this.documents.set([]);
    this.scopes.set([]);
    this.selectedScope.set(null);
  }
}
