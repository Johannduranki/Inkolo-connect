import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { AuthService, User } from '../../../auth.service';
import {
  BishopWalletSummary,
  ChurchWalletSummary
} from '../../../core/models/wallet.model';
import { WalletService } from '../../../core/services/wallet.service';
import {
  RoleMenuItem,
  RoleService,
  UserRole
} from '../../../core/services/role.service';
import { RoleSwitcherComponent } from '../role-switcher/role-switcher.component';

@Component({
  selector: 'app-role-dashboard-shell',
  standalone: true,
  imports: [RoleSwitcherComponent, CurrencyPipe],
  templateUrl: './role-dashboard-shell.component.html',
  styleUrl: './role-dashboard-shell.component.css'
})
export class RoleDashboardShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly roles = inject(RoleService);
  private readonly router = inject(Router);
  private readonly wallets = inject(WalletService);

  @Input({ required: true }) role!: UserRole;
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';

  readonly user = signal<User | null>(null);
  readonly menuItems = signal<RoleMenuItem[]>([]);
  readonly churchWallet = signal<ChurchWalletSummary | null>(null);
  readonly bishopWallet = signal<BishopWalletSummary | null>(null);

  ngOnInit(): void {
    this.menuItems.set(this.roles.getMenuItemsForRole(this.role));
    if (this.role === 'Pastor') {
      this.wallets.getChurchWalletSummary('1').subscribe((summary) =>
        this.churchWallet.set(summary)
      );
    }
    if (this.role === 'Bishop') {
      this.wallets.getBishopWalletSummary('1').subscribe((summary) =>
        this.bishopWallet.set(summary)
      );
    }
    this.auth.getProfile().subscribe({
      next: (user) => this.user.set(user),
      error: () => this.logout()
    });
  }

  openItem(item: RoleMenuItem): void {
    if (item.route) {
      void this.router.navigate([item.route]);
    }
  }

  openRoleDashboard(): void {
    void this.router.navigate([
      this.roles.getDashboardRouteForRole(this.roles.getActiveRole())
    ]);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
