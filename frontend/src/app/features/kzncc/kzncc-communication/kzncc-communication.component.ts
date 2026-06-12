import { Component, Input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { KznccMessage, KznccMessageType } from '../models/kzncc-message.model';

@Component({
  selector: 'app-kzncc-communication',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './kzncc-communication.component.html',
  styleUrl: './kzncc-communication.component.css'
})
export class KznccCommunicationComponent {
  @Input({ required: true }) messages: KznccMessage[] = [];
  readonly selectedType = signal<KznccMessageType | 'All'>('All');
  readonly types: Array<KznccMessageType | 'All'> = [
    'All',
    'General notice',
    'Church update',
    'Important alert',
    'Member information',
    'Service update'
  ];

  filteredMessages(): KznccMessage[] {
    const selected = this.selectedType();
    return selected === 'All'
      ? this.messages
      : this.messages.filter((message) => message.type === selected);
  }
}
