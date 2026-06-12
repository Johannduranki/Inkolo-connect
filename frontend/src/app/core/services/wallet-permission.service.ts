import { Injectable } from '@angular/core';
import { UserRole } from './role.service';
import { Wallet } from '../models/wallet.model';

export interface WalletPermissionContext {
  userId: string;
  roles: UserRole[];
  assignedChurchIds: string[];
  assignedRegionChurchIds: string[];
  permissions: string[];
}

@Injectable({ providedIn: 'root' })
export class WalletPermissionService {
  canViewChurchWallet(
    context: WalletPermissionContext,
    churchId: string
  ): boolean {
    if (
      context.roles.includes('Pastor') &&
      context.assignedChurchIds.includes(churchId)
    ) {
      return true;
    }

    return (
      context.roles.includes('Bishop') &&
      context.assignedRegionChurchIds.includes(churchId) &&
      context.permissions.includes('CHURCH_WALLET_VIEW')
    );
  }

  canUserViewWallet(
    context: WalletPermissionContext,
    wallet: Wallet
  ): boolean {
    if (wallet.ownerType === 'MEMBER') {
      return wallet.ownerId === context.userId;
    }
    if (wallet.ownerType === 'CHURCH') {
      return this.canViewChurchWallet(context, wallet.ownerId);
    }
    if (wallet.ownerType === 'KZNCC') {
      return context.roles.includes('KZNCC Admin');
    }
    return context.permissions.includes('PLATFORM_WALLET_VIEW');
  }

  canUserManageWallet(
    context: WalletPermissionContext,
    wallet: Wallet
  ): boolean {
    return (
      this.canUserViewWallet(context, wallet) &&
      context.permissions.includes('WALLET_MANAGE')
    );
  }
}
