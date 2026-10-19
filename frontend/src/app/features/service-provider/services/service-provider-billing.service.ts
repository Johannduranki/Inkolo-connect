import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { BillingCycle } from '../models/billing-cycle.model';

@Injectable({ providedIn: 'root' })
export class ServiceProviderBillingService {
  private readonly cycles: BillingCycle[] = [];

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
