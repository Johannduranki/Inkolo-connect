import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../../auth.service';
import { RoleSwitcherComponent } from '../../../shared/components/role-switcher/role-switcher.component';
import { KznccAnnouncement } from '../../kzncc/models/kzncc-announcement.model';
import { KznccEvent } from '../../kzncc/models/kzncc-event.model';
import {
  KznccMessage,
  KznccMessageType
} from '../../kzncc/models/kzncc-message.model';
import { KznccService } from '../../kzncc/services/kzncc.service';

type StaffTab = 'announcements' | 'messages' | 'events';

@Component({
  selector: 'app-kzncc-user-dashboard',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RoleSwitcherComponent],
  templateUrl: './kzncc-user-dashboard.component.html',
  styleUrl: './kzncc-user-dashboard.component.css'
})
export class KznccUserDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly kzncc = inject(KznccService);

  readonly user = signal<User | null>(null);
  readonly activeTab = signal<StaffTab>('announcements');
  readonly announcements = signal<KznccAnnouncement[]>([]);
  readonly messages = signal<KznccMessage[]>([]);
  readonly events = signal<KznccEvent[]>([]);
  readonly editingAnnouncementId = signal<number | undefined>(undefined);
  readonly editingMessageId = signal<number | undefined>(undefined);
  readonly editingEventId = signal<number | undefined>(undefined);
  readonly notice = signal('');

  readonly announcementTitle = new FormControl('', { nonNullable: true });
  readonly announcementCategory = new FormControl('General notice', {
    nonNullable: true
  });
  readonly announcementSummary = new FormControl('', { nonNullable: true });
  readonly announcementBody = new FormControl('', { nonNullable: true });

  readonly messageTitle = new FormControl('', { nonNullable: true });
  readonly messageType = new FormControl<KznccMessageType>('General notice', {
    nonNullable: true
  });
  readonly messageBody = new FormControl('', { nonNullable: true });

  readonly eventTitle = new FormControl('', { nonNullable: true });
  readonly eventDate = new FormControl('', { nonNullable: true });
  readonly eventTime = new FormControl('', { nonNullable: true });
  readonly eventLocation = new FormControl('', { nonNullable: true });
  readonly eventDescription = new FormControl('', { nonNullable: true });
  readonly eventStatus = new FormControl<KznccEvent['status']>('Open', {
    nonNullable: true
  });

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (user) => this.user.set(user),
      error: () => this.logout()
    });
    this.kzncc
      .getKznccAnnouncements()
      .subscribe((items) => this.announcements.set(items));
    this.kzncc.getKznccMessages().subscribe((items) => this.messages.set(items));
    this.kzncc.getKznccEvents().subscribe((items) => this.events.set(items));
  }

  saveAnnouncement(): void {
    const title = this.announcementTitle.value.trim();
    const shortDescription = this.announcementSummary.value.trim();
    const message = this.announcementBody.value.trim();
    if (!title || !shortDescription || !message) {
      this.notice.set('Complete the announcement title, summary and full message.');
      return;
    }
    this.kzncc.saveAnnouncement(
      {
        title,
        category: this.announcementCategory.value,
        shortDescription,
        message,
        date: new Date().toISOString()
      },
      this.editingAnnouncementId()
    );
    this.notice.set(
      this.editingAnnouncementId()
        ? 'Announcement updated for subscribers.'
        : 'Announcement published to subscribers.'
    );
    this.clearAnnouncement();
  }

  editAnnouncement(item: KznccAnnouncement): void {
    this.editingAnnouncementId.set(item.id);
    this.announcementTitle.setValue(item.title);
    this.announcementCategory.setValue(item.category);
    this.announcementSummary.setValue(item.shortDescription);
    this.announcementBody.setValue(item.message);
    this.activeTab.set('announcements');
  }

  saveMessage(): void {
    const title = this.messageTitle.value.trim();
    const body = this.messageBody.value.trim();
    if (!title || !body) {
      this.notice.set('Complete the message title and message body.');
      return;
    }
    this.kzncc.saveMessage(
      {
        title,
        body,
        type: this.messageType.value,
        senderName: `${this.user()?.firstName ?? 'KZNCC'} ${
          this.user()?.lastName ?? 'Staff'
        }`.trim(),
        dateTime: new Date().toISOString()
      },
      this.editingMessageId()
    );
    this.notice.set(
      this.editingMessageId()
        ? 'Subscriber message updated.'
        : 'Message published to KZNCC subscribers.'
    );
    this.clearMessage();
  }

  editMessage(item: KznccMessage): void {
    this.editingMessageId.set(item.id);
    this.messageTitle.setValue(item.title);
    this.messageType.setValue(item.type);
    this.messageBody.setValue(item.body);
    this.activeTab.set('messages');
  }

  saveEvent(): void {
    const title = this.eventTitle.value.trim();
    const date = this.eventDate.value;
    const time = this.eventTime.value;
    const location = this.eventLocation.value.trim();
    const description = this.eventDescription.value.trim();
    if (!title || !date || !time || !location || !description) {
      this.notice.set('Complete all event details before publishing.');
      return;
    }
    this.kzncc.saveEvent(
      {
        title,
        date,
        time,
        location,
        description,
        status: this.eventStatus.value
      },
      this.editingEventId()
    );
    this.notice.set(
      this.editingEventId()
        ? 'Event updated for subscribers.'
        : 'Event published to KZNCC subscribers.'
    );
    this.clearEvent();
  }

  editEvent(item: KznccEvent): void {
    this.editingEventId.set(item.id);
    this.eventTitle.setValue(item.title);
    this.eventDate.setValue(item.date);
    this.eventTime.setValue(item.time);
    this.eventLocation.setValue(item.location);
    this.eventDescription.setValue(item.description);
    this.eventStatus.setValue(item.status);
    this.activeTab.set('events');
  }

  openSubscriberDashboard(): void {
    void this.router.navigate(['/kzncc']);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  private clearAnnouncement(): void {
    this.editingAnnouncementId.set(undefined);
    this.announcementTitle.setValue('');
    this.announcementCategory.setValue('General notice');
    this.announcementSummary.setValue('');
    this.announcementBody.setValue('');
  }

  private clearMessage(): void {
    this.editingMessageId.set(undefined);
    this.messageTitle.setValue('');
    this.messageType.setValue('General notice');
    this.messageBody.setValue('');
  }

  private clearEvent(): void {
    this.editingEventId.set(undefined);
    this.eventTitle.setValue('');
    this.eventDate.setValue('');
    this.eventTime.setValue('');
    this.eventLocation.setValue('');
    this.eventDescription.setValue('');
    this.eventStatus.setValue('Open');
  }
}
