import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AirtimeDataPurchase, DataBundle } from '../models/vas.model';

@Injectable({ providedIn: 'root' })
export class AirtimeDataService {
  getNetworks(): Observable<string[]> {
    return of(['VODACOM', 'MTN', 'CELL_C', 'TELKOM', 'RAIN', 'OTHER']);
  }

  getAirtimeAmounts(_network: string): Observable<number[]> {
    return of([10, 20, 29, 50, 100, 200]);
  }

  getDataBundles(network: AirtimeDataPurchase['network']): Observable<DataBundle[]> {
    return of([
      { bundleName: 'Daily 500 MB', network, dataSize: '500 MB', validityPeriod: '1 day', price: 19 },
      { bundleName: 'Weekly 1 GB', network, dataSize: '1 GB', validityPeriod: '7 days', price: 49 },
      { bundleName: 'Monthly 5 GB', network, dataSize: '5 GB', validityPeriod: '30 days', price: 149 }
    ]);
  }

  purchaseAirtime(purchase: Omit<AirtimeDataPurchase, 'id' | 'status' | 'reference' | 'createdAt'>): Observable<AirtimeDataPurchase> {
    return of(this.complete(purchase));
  }

  purchaseData(purchase: Omit<AirtimeDataPurchase, 'id' | 'status' | 'reference' | 'createdAt'>): Observable<AirtimeDataPurchase> {
    return of(this.complete(purchase));
  }

  purchaseCombo(purchase: Omit<AirtimeDataPurchase, 'id' | 'status' | 'reference' | 'createdAt'>): Observable<AirtimeDataPurchase> {
    return of(this.complete(purchase));
  }

  private complete(
    purchase: Omit<AirtimeDataPurchase, 'id' | 'status' | 'reference' | 'createdAt'>
  ): AirtimeDataPurchase {
    return {
      ...purchase,
      id: `vas-${Date.now()}`,
      status: 'SUCCESSFUL',
      reference: `IC-VAS-${Date.now().toString().slice(-8)}`,
      createdAt: new Date().toISOString()
    };
  }
}
