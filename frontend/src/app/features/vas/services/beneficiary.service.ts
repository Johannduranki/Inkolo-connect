import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SavedBeneficiary } from '../models/vas.model';

@Injectable({ providedIn: 'root' })
export class BeneficiaryService {
  private readonly storageKey = 'inkolo_vas_beneficiaries';
  private beneficiaries: SavedBeneficiary[] = this.load();

  getSavedBeneficiaries(userId: string): Observable<SavedBeneficiary[]> {
    return of(this.beneficiaries.filter((item) => item.userId === userId));
  }

  addBeneficiary(
    beneficiary: Omit<SavedBeneficiary, 'id' | 'createdAt'>
  ): Observable<SavedBeneficiary> {
    const created = {
      ...beneficiary,
      id: `beneficiary-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.beneficiaries.push(created);
    this.save();
    return of(created);
  }

  updateBeneficiary(
    beneficiaryId: string,
    updates: Partial<SavedBeneficiary>
  ): Observable<SavedBeneficiary | undefined> {
    const beneficiary = this.beneficiaries.find(({ id }) => id === beneficiaryId);
    if (beneficiary) Object.assign(beneficiary, updates);
    this.save();
    return of(beneficiary);
  }

  deleteBeneficiary(beneficiaryId: string, userId: string): Observable<boolean> {
    const index = this.beneficiaries.findIndex(
      ({ id, userId: ownerId }) => id === beneficiaryId && ownerId === userId
    );
    if (index < 0) return of(false);
    this.beneficiaries.splice(index, 1);
    this.save();
    return of(true);
  }

  private load(): SavedBeneficiary[] {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch {
      return [];
    }
  }

  private save(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.beneficiaries));
  }
}
