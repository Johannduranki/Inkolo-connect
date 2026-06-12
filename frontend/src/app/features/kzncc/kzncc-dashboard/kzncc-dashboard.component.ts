import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService, User } from '../../../auth.service';
import { KznccAnnouncement } from '../models/kzncc-announcement.model';
import { KznccEvent } from '../models/kzncc-event.model';
import { KznccMessage } from '../models/kzncc-message.model';
import { KznccService } from '../services/kzncc.service';
import { KznccAnnouncementsComponent } from '../kzncc-announcements/kzncc-announcements.component';
import { KznccCommunicationComponent } from '../kzncc-communication/kzncc-communication.component';
import { KznccEventsComponent } from '../kzncc-events/kzncc-events.component';
import { RoleSwitcherComponent } from '../../../shared/components/role-switcher/role-switcher.component';
import { RoleService } from '../../../core/services/role.service';

@Component({
  selector: 'app-kzncc-dashboard',
  standalone: true,
  imports: [
    KznccAnnouncementsComponent,
    KznccCommunicationComponent,
    KznccEventsComponent,
    RoleSwitcherComponent
  ],
  templateUrl: './kzncc-dashboard.component.html',
  styleUrl: './kzncc-dashboard.component.css'
})
export class KznccDashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly kzncc = inject(KznccService);
  private readonly roles = inject(RoleService);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(null);
  readonly subscribed = signal(false);
  readonly loading = signal(true);
  readonly subscribing = signal(false);
  readonly termsAccepted = signal(false);
  readonly error = signal('');
  readonly announcements = signal<KznccAnnouncement[]>([]);
  readonly events = signal<KznccEvent[]>([]);
  readonly messages = signal<KznccMessage[]>([]);

  ngOnInit(): void {
    this.auth.getProfile().subscribe({
      next: (user) => {
        this.user.set(user);
        this.loadDashboard(user.id);
      },
      error: () => this.logout()
    });
  }

  subscribe(): void {
    const user = this.user();

    if (!user || this.subscribing()) {
      return;
    }

    if (!this.termsAccepted()) {
      this.error.set('Please accept the terms and conditions before subscribing.');
      return;
    }

    this.subscribing.set(true);
    this.error.set('');
    this.kzncc.subscribeToKzncc(user.id, this.termsAccepted()).subscribe({
      next: () => {
        this.subscribed.set(true);
        this.termsAccepted.set(false);
        this.subscribing.set(false);
      },
      error: (error) => {
        this.error.set(error.error?.message || 'KZNCC subscription could not be completed.');
        this.subscribing.set(false);
      }
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  openRoleDashboard(): void {
    void this.router.navigate([
      this.roles.getDashboardRouteForRole(this.roles.getActiveRole())
    ]);
  }

  private loadDashboard(userId: number): void {
    forkJoin({
      subscribed: this.kzncc.checkKznccSubscription(userId),
      announcements: this.kzncc.getKznccAnnouncements(),
      events: this.kzncc.getKznccEvents(),
      messages: this.kzncc.getKznccMessages()
    }).subscribe({
      next: ({ subscribed, announcements, events, messages }) => {
        this.subscribed.set(subscribed);
        this.announcements.set(announcements);
        this.events.set(events);
        this.messages.set(messages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('The KZNCC dashboard could not be loaded.');
        this.loading.set(false);
      }
    });
  }
}
