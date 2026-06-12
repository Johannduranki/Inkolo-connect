import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { KznccAdminEvent } from '../models/kzncc-admin-event.model';

@Injectable({ providedIn: 'root' })
export class KznccEventService {
  private readonly events = new BehaviorSubject<KznccAdminEvent[]>([
    {
      id: 1,
      title: 'Regional Church Leadership Meeting',
      category: 'Leadership',
      date: '2026-07-18',
      startTime: '09:00',
      endTime: '13:00',
      location: 'Durban Central Fellowship Hall',
      description: 'Regional planning and church leadership development.',
      host: 'KZNCC',
      targetAudience: 'Church leaders only',
      rsvpRequired: true,
      maximumAttendees: 350,
      status: 'Published'
    }
  ]);

  getKznccEvents(): Observable<KznccAdminEvent[]> {
    return this.events.asObservable();
  }

  createEvent(
    event: Omit<KznccAdminEvent, 'id'>
  ): Observable<KznccAdminEvent> {
    const created = { ...event, id: Date.now() };
    this.events.next([created, ...this.events.value]);
    return of(created);
  }

  updateEvent(
    eventId: number,
    updates: Partial<KznccAdminEvent>
  ): Observable<KznccAdminEvent | undefined> {
    let updated: KznccAdminEvent | undefined;
    this.events.next(
      this.events.value.map((event) => {
        if (event.id !== eventId) {
          return event;
        }
        updated = { ...event, ...updates };
        return updated;
      })
    );
    return of(updated);
  }

  publishEvent(eventId: number): Observable<KznccAdminEvent | undefined> {
    return this.updateEvent(eventId, { status: 'Published' });
  }

  getEventsForMember(_memberId: number): Observable<KznccAdminEvent[]> {
    return this.getKznccEvents();
  }

  getEventsForChurch(_churchId: number): Observable<KznccAdminEvent[]> {
    return this.getKznccEvents();
  }
}
