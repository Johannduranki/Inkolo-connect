import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { AuthService, ServiceSubscription } from '../../../auth.service';
import { KznccAnnouncement } from '../models/kzncc-announcement.model';
import { KznccEvent } from '../models/kzncc-event.model';
import { KznccMessage } from '../models/kzncc-message.model';

const announcements: KznccAnnouncement[] = [
  {
    id: 1,
    title: 'KZNCC Digital Platform Launch',
    date: '2026-06-09T08:00:00+02:00',
    category: 'Platform',
    shortDescription: 'The new KZNCC member communication area is now available.',
    message:
      'Welcome to the KZNCC digital platform. Members can now receive official announcements, council messages and event information through Inkolo Connect.'
  },
  {
    id: 2,
    title: 'Winter Community Support Programme',
    date: '2026-06-06T09:30:00+02:00',
    category: 'Community support',
    shortDescription: 'Churches are invited to identify families needing winter assistance.',
    message:
      'KZNCC member churches may submit requests for blankets and food support through their regional coordinator before 20 June 2026.'
  },
  {
    id: 3,
    title: 'Council Membership Records Update',
    date: '2026-06-02T14:00:00+02:00',
    category: 'Member information',
    shortDescription: 'Please ensure your church and personal contact details are current.',
    message:
      'Accurate membership records help KZNCC deliver notices and services. Members should update missing contact information in My Profile.'
  },
  {
    id: 4,
    title: 'Regional Prayer Weekend',
    date: '2026-05-28T11:00:00+02:00',
    category: 'Church update',
    shortDescription: 'Regional churches will host a joint prayer weekend in July.',
    message:
      'The programme will include worship, youth sessions and community prayer. Full venue details will be shared with participating churches.'
  }
];

const events: KznccEvent[] = [
  {
    id: 1,
    title: 'Regional Church Leadership Meeting',
    date: '2026-06-27',
    time: '09:00',
    location: 'Durban Central Community Hall',
    description: 'A regional planning meeting for pastors, council leaders and church administrators.',
    status: 'Open'
  },
  {
    id: 2,
    title: 'KZNCC Youth Development Workshop',
    date: '2026-07-11',
    time: '10:00',
    location: 'KwaDukuza Church Centre',
    description: 'Practical leadership, career and community development sessions for young members.',
    status: 'Limited space'
  },
  {
    id: 3,
    title: 'Community Outreach and Food Drive',
    date: '2026-07-25',
    time: '08:30',
    location: 'Tugela Regional Office',
    description: 'Member churches will prepare and distribute food parcels to local families.',
    status: 'Registration soon'
  }
];

const messages: KznccMessage[] = [
  {
    id: 1,
    title: 'Welcome to the KZNCC member communication area',
    senderName: 'KZNCC Member Services',
    dateTime: '2026-06-09T08:15:00+02:00',
    type: 'General notice',
    body: 'This communication area will keep you connected to official KZNCC information and council services.'
  },
  {
    id: 2,
    title: 'Regional coordinator contact details',
    senderName: 'Nomusa Dlamini',
    dateTime: '2026-06-08T13:20:00+02:00',
    type: 'Member information',
    body: 'Regional coordinators are available to help member churches with registrations, events and support requests.'
  },
  {
    id: 3,
    title: 'Important: event registration verification',
    senderName: 'KZNCC Events Office',
    dateTime: '2026-06-07T10:45:00+02:00',
    type: 'Important alert',
    body: 'Only use official KZNCC registration links shared inside Inkolo Connect or by your church office.'
  },
  {
    id: 4,
    title: 'Member service directory update',
    senderName: 'KZNCC Digital Services',
    dateTime: '2026-06-05T16:00:00+02:00',
    type: 'Service update',
    body: 'Additional community support and training services will be added to the member directory soon.'
  },
  {
    id: 5,
    title: 'Joint Sunday service notice',
    senderName: 'KZNCC Church Relations',
    dateTime: '2026-06-03T09:00:00+02:00',
    type: 'Church update',
    body: 'Participating congregations will receive the final joint-service programme from their local church leadership.'
  }
];

@Injectable({ providedIn: 'root' })
export class KznccService {
  private readonly auth = inject(AuthService);

  getKznccAnnouncements(): Observable<KznccAnnouncement[]> {
    return of([...announcements].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ));
  }

  getKznccEvents(): Observable<KznccEvent[]> {
    return of([...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    ));
  }

  getKznccMessages(): Observable<KznccMessage[]> {
    return of([...messages].sort(
      (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
    ));
  }

  checkKznccSubscription(_userId: number): Observable<boolean> {
    return this.auth.getSubscriptions().pipe(
      map((subscriptions) => subscriptions.some(
        (subscription) =>
          subscription.serviceCode === 'kzncc' &&
          subscription.status === 'active'
      ))
    );
  }

  subscribeToKzncc(
    _userId: number,
    acceptedTerms: boolean
  ): Observable<ServiceSubscription> {
    return this.auth.subscribeToService('kzncc', 'monthly', acceptedTerms);
  }
}
