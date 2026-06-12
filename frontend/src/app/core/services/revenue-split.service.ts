import { Injectable } from '@angular/core';

export interface PaidServicePayment {
  serviceId: string;
  serviceType: 'FREE' | 'PAID';
  amount: number;
  serviceProviderRate: number;
  operatingRate: number;
  kznccRate: number;
  churchRate: number;
}

export interface RevenueSplit {
  serviceProviderShare: number;
  operatingCost: number;
  kznccShare: number;
  churchShare: number;
}

@Injectable({ providedIn: 'root' })
export class RevenueSplitService {
  processPaidServiceRevenueSplit(payment: PaidServicePayment): RevenueSplit {
    if (payment.serviceType !== 'PAID') {
      return {
        serviceProviderShare: 0,
        operatingCost: 0,
        kznccShare: 0,
        churchShare: 0
      };
    }

    return {
      serviceProviderShare: payment.amount * payment.serviceProviderRate,
      operatingCost: payment.amount * payment.operatingRate,
      kznccShare: payment.amount * payment.kznccRate,
      churchShare: payment.amount * payment.churchRate
    };
  }
}
