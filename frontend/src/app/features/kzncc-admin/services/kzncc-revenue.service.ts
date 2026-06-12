import { Injectable } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import {
  KznccRevenueSummary,
  KznccServiceRevenue
} from '../models/kzncc-service-revenue.model';

@Injectable({ providedIn: 'root' })
export class KznccRevenueService {
  private readonly services: KznccServiceRevenue[] = [
    this.createPaidService(1, 'Funeral Cover', 5000, 99, 250000, 49500),
    this.createPaidService(2, 'Airtime and Data', 4200, 35, 73500, 14700),
    this.createPaidService(3, 'Electricity Recharge', 3100, 80, 124000, 24800),
    this.createPaidService(4, 'Fibre Connect', 980, 399, 234612, 39102),
    this.createPaidService(5, 'Wallet transaction fees', 7200, 8, 23040, 5760),
    this.createPaidService(6, 'VAS Services', 3900, 20, 35100, 7800),
    this.createPaidService(7, 'Job Search Premium', 1200, 25, 12000, 3000),
    this.createPaidService(8, 'Education Services', 1600, 49, 39200, 7840),
    this.createPaidService(9, 'Keytcha Property Listings', 430, 75, 16125, 3225),
    this.createPaidService(10, 'Catch-a-Lift Paid Rides', 2100, 30, 31500, 6300),
    {
      id: 11,
      serviceName: 'My Community',
      serviceType: 'FREE',
      membersSubscribed: 45000,
      monthlyPrice: 0,
      totalRevenue: 0,
      serviceProviderShare: 0,
      operatingCost: 0,
      kznccShare: 0,
      churchShare: 0,
      netPayableToKzncc: 0,
      netPayableToChurches: 0
    },
    {
      id: 12,
      serviceName: 'Announcements',
      serviceType: 'FREE',
      membersSubscribed: 45000,
      monthlyPrice: 0,
      totalRevenue: 0,
      serviceProviderShare: 0,
      operatingCost: 0,
      kznccShare: 0,
      churchShare: 0,
      netPayableToKzncc: 0,
      netPayableToChurches: 0
    }
  ];

  getPaidServices(): Observable<KznccServiceRevenue[]> {
    return of(this.services.filter(({ serviceType }) => serviceType === 'PAID'));
  }

  getRevenueByPaidService(): Observable<KznccServiceRevenue[]> {
    return this.getPaidServices();
  }

  getRevenueByService(): Observable<KznccServiceRevenue[]> {
    return this.getRevenueByPaidService();
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

  private createPaidService(
    id: number,
    serviceName: string,
    membersSubscribed: number,
    monthlyPrice: number,
    serviceProviderShare: number,
    operatingCost: number
  ): KznccServiceRevenue {
    const totalRevenue = membersSubscribed * monthlyPrice;
    const remainingRevenue = Math.max(
      totalRevenue - serviceProviderShare - operatingCost,
      0
    );
    const kznccShare = remainingRevenue * 0.4;
    const churchShare = remainingRevenue * 0.6;

    return {
      id,
      serviceName,
      serviceType: 'PAID',
      membersSubscribed,
      monthlyPrice,
      totalRevenue,
      serviceProviderShare,
      operatingCost,
      kznccShare,
      churchShare,
      netPayableToKzncc: kznccShare,
      netPayableToChurches: churchShare
    };
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
