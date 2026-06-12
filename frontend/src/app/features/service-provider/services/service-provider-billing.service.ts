import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { BillingCycle } from '../models/billing-cycle.model';

@Injectable({ providedIn: 'root' })
export class ServiceProviderBillingService {
  private readonly cycles: BillingCycle[] = [
    {
      id: 'bc-2026-06',
      serviceProviderId: 'sp-001',
      serviceId: 'funeral-cover-001',
      serviceName: 'Funeral Cover',
      cycleName: 'June 2026 Funeral Cover Billing',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      paymentDueDate: '2026-06-01',
      billingFrequency: 'MONTHLY',
      status: 'OPEN',
      totalMembersBilled: 2700,
      totalMembersPaid: 2500,
      totalFailedPayments: 100,
      totalOverduePayments: 100,
      totalAmountCollected: 247500,
      totalAmountPayableToProvider: 180000
    },
    {
      id: 'bc-2026-05',
      serviceProviderId: 'sp-001',
      serviceId: 'funeral-cover-001',
      serviceName: 'Funeral Cover',
      cycleName: 'May 2026 Funeral Cover Billing',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      paymentDueDate: '2026-05-01',
      billingFrequency: 'MONTHLY',
      status: 'COMPLETED',
      totalMembersBilled: 2600,
      totalMembersPaid: 2420,
      totalFailedPayments: 80,
      totalOverduePayments: 100,
      totalAmountCollected: 239580,
      totalAmountPayableToProvider: 174000
    }
  ];

  getBillingCycles(serviceProviderId: string): Observable<BillingCycle[]> {
    return of(this.cycles.filter((cycle) => cycle.serviceProviderId === serviceProviderId));
  }

  getCurrentBillingCycle(
    serviceProviderId: string,
    serviceId: string
  ): Observable<BillingCycle | undefined> {
    return of(this.cycles.find(
      (cycle) =>
        cycle.serviceProviderId === serviceProviderId &&
        cycle.serviceId === serviceId &&
        cycle.status === 'OPEN'
    ));
  }

  getUpcomingBillingCycle(
    serviceProviderId: string,
    serviceId: string
  ): Observable<BillingCycle> {
    return of({
      ...this.cycles[0],
      id: 'bc-2026-07',
      cycleName: 'July 2026 Funeral Cover Billing',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      paymentDueDate: '2026-07-01',
      totalMembersPaid: 0,
      totalAmountCollected: 0,
      totalAmountPayableToProvider: 0
    });
  }

  getBillingCycleSummary(billingCycleId: string): Observable<BillingCycle | undefined> {
    return of(this.cycles.find(({ id }) => id === billingCycleId));
  }
}
