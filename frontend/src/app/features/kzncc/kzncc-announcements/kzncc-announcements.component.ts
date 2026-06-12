import { Component, Input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { KznccAnnouncement } from '../models/kzncc-announcement.model';

@Component({
  selector: 'app-kzncc-announcements',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './kzncc-announcements.component.html',
  styleUrl: './kzncc-announcements.component.css'
})
export class KznccAnnouncementsComponent {
  @Input({ required: true }) announcements: KznccAnnouncement[] = [];
  readonly showAll = signal(false);
  readonly selected = signal<KznccAnnouncement | null>(null);

  visibleAnnouncements(): KznccAnnouncement[] {
    return this.showAll() ? this.announcements : this.announcements.slice(0, 3);
  }
}
