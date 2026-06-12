import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface RevenueShareFormula {
  serviceId: number;
  serviceName: string;
  serviceProviderRate: number;
  operatingRate: number;
  kznccRate: number;
  churchRate: number;
}

export type RevenueRateField =
  | 'serviceProviderRate'
  | 'operatingRate'
  | 'kznccRate'
  | 'churchRate';

const defaultFormulas: RevenueShareFormula[] = [
  formula(1, 'Funeral Cover', 55, 10, 15, 20),
  formula(2, 'Airtime and Data', 70, 10, 8, 12),
  formula(3, 'Electricity Recharge', 72, 10, 8, 10),
  formula(4, 'Fibre Connect', 65, 12, 10, 13),
  formula(5, 'Wallet transaction fees', 35, 25, 20, 20),
  formula(6, 'VAS Services', 65, 12, 10, 13),
  formula(7, 'Job Search Premium', 40, 20, 20, 20),
  formula(8, 'Education Services', 55, 15, 15, 15),
  formula(9, 'Keytcha Property Listings', 50, 20, 15, 15),
  formula(10, 'Catch-a-Ride Paid Rides', 70, 10, 8, 12),
  formula(11, 'Insurance-linked Products', 65, 10, 12, 13),
  formula(12, 'KZNCC Membership', 0, 20, 50, 30),
  formula(13, 'Other Paid Services', 50, 20, 15, 15)
];

function formula(
  serviceId: number,
  serviceName: string,
  serviceProviderRate: number,
  operatingRate: number,
  kznccRate: number,
  churchRate: number
): RevenueShareFormula {
  return {
    serviceId,
    serviceName,
    serviceProviderRate,
    operatingRate,
    kznccRate,
    churchRate
  };
}

@Injectable({ providedIn: 'root' })
export class RevenueShareFormulaService {
  private readonly storageKey = 'duranki_revenue_share_formulas';
  private readonly formulasSubject = new BehaviorSubject<RevenueShareFormula[]>(
    this.load()
  );

  getFormulas(): Observable<RevenueShareFormula[]> {
    return this.formulasSubject.asObservable();
  }

  getCurrentFormulas(): RevenueShareFormula[] {
    return this.formulasSubject.value.map((item) => ({ ...item }));
  }

  updateRate(
    serviceId: number,
    field: RevenueRateField,
    rate: number
  ): RevenueShareFormula[] {
    const normalizedRate = Math.min(100, Math.max(0, rate || 0));
    const formulas = this.formulasSubject.value.map((item) =>
      item.serviceId === serviceId
        ? { ...item, [field]: normalizedRate }
        : item
    );
    this.save(formulas);
    return formulas;
  }

  resetDefaults(): void {
    this.save(defaultFormulas.map((item) => ({ ...item })));
  }

  totalRate(item: RevenueShareFormula): number {
    return (
      item.serviceProviderRate +
      item.operatingRate +
      item.kznccRate +
      item.churchRate
    );
  }

  private load(): RevenueShareFormula[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as RevenueShareFormula[];
        if (Array.isArray(parsed) && parsed.length === defaultFormulas.length) {
          return parsed;
        }
      }
    } catch {
      // Defaults keep the dashboard usable when storage is unavailable.
    }
    return defaultFormulas.map((item) => ({ ...item }));
  }

  private save(formulas: RevenueShareFormula[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(formulas));
    } catch {
      // Keep the active in-memory configuration for this session.
    }
    this.formulasSubject.next(formulas);
  }
}
