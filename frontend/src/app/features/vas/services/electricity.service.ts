import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ElectricityPurchase } from '../models/vas.model';

@Injectable({ providedIn: 'root' })
export class ElectricityService {
  getElectricityProviders(): Observable<string[]> {
    return of([
      'Eskom', 'City Power', 'Tshwane', 'eThekwini', 'Cape Town',
      'Nelson Mandela Bay', 'Other municipality / provider'
    ]);
  }

  validateMeterNumber(meterNumber: string, provider: string): Observable<boolean> {
    return of(Boolean(provider && /^\d{6,20}$/.test(meterNumber)));
  }

  purchaseElectricity(
    purchase: Omit<ElectricityPurchase, 'id' | 'status' | 'reference' | 'createdAt' | 'token'>
  ): Observable<ElectricityPurchase> {
    return of({
      ...purchase,
      id: `electricity-${Date.now()}`,
      status: 'SUCCESSFUL',
      token: `${Math.floor(1000_0000_0000_0000 + Math.random() * 8999_9999_9999_9999)}`,
      reference: `IC-ELEC-${Date.now().toString().slice(-8)}`,
      createdAt: new Date().toISOString()
    });
  }
}
