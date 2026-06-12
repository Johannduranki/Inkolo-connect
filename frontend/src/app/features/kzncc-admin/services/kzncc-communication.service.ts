import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { KznccAdminMessage } from '../models/kzncc-admin-message.model';

@Injectable({ providedIn: 'root' })
export class KznccCommunicationService {
  private readonly messages = new BehaviorSubject<KznccAdminMessage[]>([
    {
      id: 1,
      title: 'Regional leadership meeting',
      category: 'Important notice',
      body: 'Church leaders are reminded to confirm attendance.',
      targetAudience: 'All Church Leaders',
      priority: 'Important',
      status: 'Sent',
      createdAt: new Date().toISOString()
    }
  ]);

  getMessageHistory(): Observable<KznccAdminMessage[]> {
    return this.messages.asObservable();
  }

  sendMessage(
    message: Omit<KznccAdminMessage, 'id' | 'status' | 'createdAt'>
  ): Observable<KznccAdminMessage> {
    return this.save(message, 'Sent');
  }

  saveMessageDraft(
    message: Omit<KznccAdminMessage, 'id' | 'status' | 'createdAt'>
  ): Observable<KznccAdminMessage> {
    return this.save(message, 'Draft');
  }

  getTargetAudienceOptions(): Observable<string[]> {
    return of([
      'Individual Member',
      'Individual Church',
      'Selected Churches',
      'Church Leaders',
      'All Church Leaders',
      'All Members',
      'All Members and Leaders'
    ]);
  }

  getChurchLeaders(): Observable<string[]> {
    return of(['Pastor N. Mthembu', 'Bishop T. Khumalo', 'Pastor L. Sithole']);
  }

  getMembersByChurch(churchId: number): Observable<string[]> {
    return of([`Member ${churchId}-1`, `Member ${churchId}-2`]);
  }

  private save(
    message: Omit<KznccAdminMessage, 'id' | 'status' | 'createdAt'>,
    status: 'Sent' | 'Draft'
  ): Observable<KznccAdminMessage> {
    const created = {
      ...message,
      id: Date.now(),
      status,
      createdAt: new Date().toISOString()
    };
    this.messages.next([created, ...this.messages.value]);
    return of(created);
  }
}
