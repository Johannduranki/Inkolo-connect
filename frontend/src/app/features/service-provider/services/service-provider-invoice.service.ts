import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, of } from 'rxjs';
import { ServiceProviderInvoice } from '../models/service-provider-invoice.model';
import { ServiceProviderService } from './service-provider.service';

@Injectable({ providedIn: 'root' })
export class ServiceProviderInvoiceService {
  private readonly providers = inject(ServiceProviderService);
  private readonly invoices = new BehaviorSubject<ServiceProviderInvoice[]>([]);

  createInvoiceForBillingCycle(
    serviceProviderId: string,
    billingCycleId: string
  ): Observable<ServiceProviderInvoice> {
    return this.providers
      .getPaidMembersByBillingCycle(serviceProviderId, billingCycleId)
      .pipe(
        map((members) => {
          const paidMembers = members.filter(({ paymentStatus }) => paymentStatus === 'PAID');
          const totalPremiumsCollected = paidMembers.reduce(
            (sum, member) => sum + member.monthlyPremium,
            0
          );
          const invoice: ServiceProviderInvoice = {
            id: `invoice-${Date.now()}`,
            invoiceNumber: `INV-FUN-${new Date().getFullYear()}-${String(this.invoices.value.length + 1).padStart(3, '0')}`,
            serviceProviderId,
            serviceProviderName: this.providers.provider.name,
            billingCycleId,
            serviceId: 'funeral-cover-001',
            serviceName: 'Funeral Cover',
            totalMembersPaid: paidMembers.length,
            totalPremiumsCollected,
            serviceProviderShare: totalPremiumsCollected * 0.73,
            platformOperatingFee: totalPremiumsCollected * 0.1,
            kznccShare: totalPremiumsCollected * 0.08,
            churchShare: totalPremiumsCollected * 0.09,
            invoiceStatus: 'DRAFT',
            invoiceDate: new Date().toISOString()
          };
          this.invoices.next([invoice, ...this.invoices.value]);
          return invoice;
        })
      );
  }

  saveInvoiceDraft(invoice: ServiceProviderInvoice): Observable<ServiceProviderInvoice> {
    return of(invoice);
  }

  submitInvoice(invoiceId: string): Observable<ServiceProviderInvoice | undefined> {
    let submitted: ServiceProviderInvoice | undefined;
    this.invoices.next(this.invoices.value.map((invoice) => {
      if (invoice.id !== invoiceId) {
        return invoice;
      }
      submitted = {
        ...invoice,
        invoiceStatus: 'SUBMITTED',
        submittedAt: new Date().toISOString()
      };
      return submitted;
    }));
    return of(submitted);
  }

  getInvoiceHistory(serviceProviderId: string): Observable<ServiceProviderInvoice[]> {
    return new Observable((subscriber) => {
      const subscription = this.invoices.subscribe((invoices) =>
        subscriber.next(
          invoices.filter((invoice) => invoice.serviceProviderId === serviceProviderId)
        )
      );
      return () => subscription.unsubscribe();
    });
  }

  getInvoiceById(invoiceId: string): Observable<ServiceProviderInvoice | undefined> {
    return of(this.invoices.value.find(({ id }) => id === invoiceId));
  }
}
