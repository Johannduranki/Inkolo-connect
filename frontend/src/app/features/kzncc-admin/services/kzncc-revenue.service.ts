import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RevenueShareFormulaService } from '../../../core/services/revenue-share-formula.service';
import {
  KznccRevenueSummary,
  KznccServiceRevenue
} from '../models/kzncc-service-revenue.model';

interface PaidServiceActivity {
  serviceId: number;
  membersSubscribed: number;
  monthlyPrice: number;
}

@Injectable({ providedIn: 'root' })
export class KznccRevenueService {
  private readonly formulas = inject(RevenueShareFormulaService);
  private readonly activity: PaidServiceActivity[] = [];

  getPaidServices(): Observable<KznccServiceRevenue[]> {
    return this.formulas.getFormulas().pipe(
      map((formulas) =>
        formulas.map((formula) => {
          const serviceActivity = this.activity.find(
            ({ serviceId }) => serviceId === formula.serviceId
          ) ?? activity(formula.serviceId, 0, 0);
          const totalRevenue =
            serviceActivity.membersSubscribed * serviceActivity.monthlyPrice;
          const serviceProviderShare =
            totalRevenue * (formula.serviceProviderRate / 100);
          const operatingCost = totalRevenue * (formula.operatingRate / 100);
          const kznccShare = totalRevenue * (formula.kznccRate / 100);
          const churchShare = totalRevenue * (formula.churchRate / 100);

          return {
            id: formula.serviceId,
            serviceName: formula.serviceName,
            serviceType: 'PAID' as const,
            membersSubscribed: serviceActivity.membersSubscribed,
            monthlyPrice: serviceActivity.monthlyPrice,
            totalRevenue,
            serviceProviderRate: formula.serviceProviderRate,
            operatingRate: formula.operatingRate,
            kznccRate: formula.kznccRate,
            churchRate: formula.churchRate,
            serviceProviderShare,
            operatingCost,
            kznccShare,
            churchShare,
            netPayableToKzncc: kznccShare,
            netPayableToChurches: churchShare
          };
        })
      )
    );
  }

  getRevenueByPaidService(): Observable<KznccServiceRevenue[]> {
    return this.getPaidServices();
  }

  getRevenueByService(): Observable<KznccServiceRevenue[]> {
    return this.getPaidServices();
  }

  getRevenueByChurchForPaidServices(): Observable<
    { churchId: number; totalRevenue: number; kznccShare: number; churchShare: number }[]
  > {
    return this.getPaidServices().pipe(
      map((services) => {
        const totals = this.sumRevenue(services);
        return [1, 2, 3, 4, 5].map((churchId, index) => {
          const factor = [0.2, 0.25, 0.15, 0.28, 0.12][index];
          return {
            churchId,
            totalRevenue: totals.totalMonthlyRevenue * factor,
            kznccShare: totals.kznccRevenueShare * factor,
            churchShare: totals.churchRevenueShare * factor
          };
        });
      })
    );
  }

  getRevenueByChurch(
    churchId: number
  ): Observable<{ serviceName: string; revenue: number }[]> {
    return this.getPaidServices().pipe(
      map((services) =>
        services.map((service) => ({
          serviceName: service.serviceName,
          revenue: service.totalRevenue * (0.12 + churchId * 0.02)
        }))
      )
    );
  }

  calculateTotalPaidServiceRevenue(): Observable<number> {
    return this.getPaidServices().pipe(
      map((services) =>
        services.reduce((total, service) => total + service.totalRevenue, 0)
      )
    );
  }

  getRevenueSummary(): Observable<KznccRevenueSummary> {
    return this.getPaidServices().pipe(map((services) => this.sumRevenue(services)));
  }

  calculateKznccShare(serviceRevenue: KznccServiceRevenue): number {
    return serviceRevenue.kznccShare;
  }

  calculateChurchShare(serviceRevenue: KznccServiceRevenue): number {
    return serviceRevenue.churchShare;
  }

  private sumRevenue(services: KznccServiceRevenue[]): KznccRevenueSummary {
    return services.reduce<KznccRevenueSummary>(
      (summary, service) => ({
        paidServicesActive:
          summary.paidServicesActive + service.membersSubscribed,
        totalMonthlyRevenue:
          summary.totalMonthlyRevenue + service.totalRevenue,
        serviceProviderShare:
          summary.serviceProviderShare + service.serviceProviderShare,
        operatingCost: summary.operatingCost + service.operatingCost,
        kznccRevenueShare:
          summary.kznccRevenueShare + service.netPayableToKzncc,
        churchRevenueShare:
          summary.churchRevenueShare + service.netPayableToChurches
      }),
      {
        paidServicesActive: 0,
        totalMonthlyRevenue: 0,
        serviceProviderShare: 0,
        operatingCost: 0,
        kznccRevenueShare: 0,
        churchRevenueShare: 0
      }
    );
  }
}

function activity(
  serviceId: number,
  membersSubscribed: number,
  monthlyPrice: number
): PaidServiceActivity {
  return { serviceId, membersSubscribed, monthlyPrice };
}
