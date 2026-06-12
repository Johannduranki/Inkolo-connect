import { Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { KznccEvent } from '../models/kzncc-event.model';

@Component({
  selector: 'app-kzncc-events',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './kzncc-events.component.html',
  styleUrl: './kzncc-events.component.css'
})
export class KznccEventsComponent {
  @Input({ required: true }) events: KznccEvent[] = [];
}
