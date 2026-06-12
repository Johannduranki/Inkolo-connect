import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import {
  AfricanBankCashOutRequest,
  BishopWalletSummary,
  ChurchWalletSummary,
  CycleTopUpRequest,
  KznccWalletSummary,
  MemberWalletTransferRequest,
  Wallet,
  WalletOperationResult,
  WalletOwnerType,
  WalletTransaction
} from '../models/wallet.model';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/wallet';
  private readonly memberDirectory = new Map<string, string>([
    ['0712345678', 'Jeremy Shabalala'],
    ['0725550184', 'Nandi Mthembu'],
    ['0736614209', 'Thabo Khumalo'],
    ['0789441132', 'Lerato Sithole'],
    ['0741002003', 'Ayanda Dlamini'],
    ['0763004005', 'Sipho Ncube'],
    ['0795006007', 'Zanele Mkhize'],
    ['0817008009', 'Mandla Cele']
  ]);
  private readonly wallets: Wallet[] = [
    this.wallet('member-1', 'MEMBER', '1', 'Personal Wallet', 850),
    this.wallet('church-1', 'CHURCH', '1', 'Grace Community Church Wallet', 186400),
    this.wallet('church-2', 'CHURCH', '2', 'Zion Revival Church Wallet', 231800),
    this.wallet('kzncc-1', 'KZNCC', '1', 'KZNCC Revenue Wallet', 486320)
  ];
  private readonly transactions: WalletTransaction[] = [
    this.transaction('kt-1', 'kzncc-1', 'KZNCC_REVENUE_SHARE', 78200, 'Funeral Cover revenue share'),
    this.transaction('kt-2', 'kzncc-1', 'KZNCC_REVENUE_SHARE', 22440, 'Airtime and Data revenue share'),
    this.transaction('kt-3', 'kzncc-1', 'KZNCC_REVENUE_SHARE', 39680, 'Electricity Recharge revenue share'),
    this.transaction('kt-4', 'kzncc-1', 'KZNCC_REVENUE_SHARE', 46914, 'Fibre Connect revenue share')
  ];

  createWallet(ownerType: WalletOwnerType, ownerId: string): Observable<Wallet> {
    const wallet = this.wallet(
      `${ownerType.toLowerCase()}-${ownerId}`,
      ownerType,
      ownerId,
      `${ownerType} Wallet`,
      0
    );
    this.wallets.push(wallet);
    return of(wallet);
  }

  getMemberWallet(memberId: string): Observable<Wallet | undefined> {
    void memberId;
    return this.http.get<Wallet & { transactions: WalletTransaction[] }>(this.apiUrl);
  }

  getChurchWallet(churchId: string): Observable<Wallet | undefined> {
    return of(this.findWallet('CHURCH', churchId));
  }

  getKznccWallet(kznccId: string): Observable<Wallet | undefined> {
    return of(this.findWallet('KZNCC', kznccId));
  }

  getWalletTransactions(walletId: string): Observable<WalletTransaction[]> {
    void walletId;
    return this.http
      .get<Wallet & { transactions: WalletTransaction[] }>(this.apiUrl)
      .pipe(map(({ transactions }) => transactions));
  }

  getChurchWalletSummary(churchId: string): Observable<ChurchWalletSummary> {
    const wallet = this.findWallet('CHURCH', churchId);
    return of({
      churchId,
      churchName: wallet?.walletName.replace(' Wallet', '') ?? 'Church',
      pastorName: churchId === '1' ? 'Pastor N. Mthembu' : 'Bishop T. Khumalo',
      totalTithes: churchId === '1' ? 92000 : 114000,
      totalOfferings: churchId === '1' ? 34800 : 41700,
      totalPaidServiceRevenueShare: churchId === '1' ? 59600 : 76100,
      walletBalance: wallet?.balance ?? 0,
      pendingPayouts: 12000,
      memberCount: churchId === '1' ? 8200 : 10300
    });
  }

  getBishopWalletSummary(bishopId: string): Observable<BishopWalletSummary> {
    return of(['1', '2']).pipe(
      map((churchIds) => {
        const assignedChurches = churchIds.map((churchId) => {
          const wallet = this.findWallet('CHURCH', churchId);
          return {
            churchId,
            churchName: wallet?.walletName.replace(' Wallet', '') ?? 'Church',
            pastorName: churchId === '1' ? 'Pastor N. Mthembu' : 'Bishop T. Khumalo',
            totalTithes: churchId === '1' ? 92000 : 114000,
            totalOfferings: churchId === '1' ? 34800 : 41700,
            totalPaidServiceRevenueShare: churchId === '1' ? 59600 : 76100,
            walletBalance: wallet?.balance ?? 0,
            pendingPayouts: 12000,
            memberCount: churchId === '1' ? 8200 : 10300
          };
        });
        return {
          bishopId,
          bishopName: 'Bishop T. Khumalo',
          assignedChurches,
          totalWalletBalance: assignedChurches.reduce((sum, item) => sum + item.walletBalance, 0),
          totalTithes: assignedChurches.reduce((sum, item) => sum + item.totalTithes, 0),
          totalOfferings: assignedChurches.reduce((sum, item) => sum + item.totalOfferings, 0),
          totalRevenueShare: assignedChurches.reduce(
            (sum, item) => sum + item.totalPaidServiceRevenueShare,
            0
          ),
          totalMembers: assignedChurches.reduce((sum, item) => sum + item.memberCount, 0)
        };
      })
    );
  }

  getKznccRevenueWalletSummary(kznccId: string): Observable<KznccWalletSummary> {
    const wallet = this.findWallet('KZNCC', kznccId);
    return of({
      kznccId,
      walletBalance: wallet?.balance ?? 0,
      totalRevenueShare: 486320,
      monthlyRevenueShare: 196834,
      revenueByService: [
        { serviceName: 'Funeral Cover', amount: 78200 },
        { serviceName: 'Fibre Connect', amount: 46914 },
        { serviceName: 'Electricity Recharge', amount: 39680 }
      ],
      revenueByChurch: [
        { churchName: 'Grace Community Church', amount: 49600 },
        { churchName: 'Zion Revival Church', amount: 62800 }
      ],
      pendingPayouts: 58400
    });
  }

  payTithe(memberId: string, churchId: string, amount: number): Observable<boolean> {
    return of(memberId.length > 0 && churchId.length > 0 && amount > 0);
  }

  payOffering(memberId: string, churchId: string, amount: number): Observable<boolean> {
    return this.payTithe(memberId, churchId, amount);
  }

  requestWalletPayout(walletId: string, amount: number): Observable<boolean> {
    return of(walletId.length > 0 && amount > 0);
  }

  topUpWithCycle(request: CycleTopUpRequest): Observable<WalletOperationResult> {
    return this.http
      .post<{ transaction: WalletTransaction }>(`${this.apiUrl}/top-up`, {
        amount: request.amount
      })
      .pipe(
        map(({ transaction }) => ({
          successful: true,
          reference: transaction.reference,
          amount: transaction.amount,
          message: 'Cycle card payment approved.',
          redirectUrl: `${request.returnUrl}?cycleReference=${transaction.reference}`
        })),
        catchError(({ error }) =>
          of({
            successful: false,
            reference: '',
            amount: request.amount,
            message: error?.message ?? 'Cycle could not process this top up.'
          })
        )
      );
  }

  cashOutToAfricanBank(
    request: AfricanBankCashOutRequest
  ): Observable<WalletOperationResult> {
    return this.http
      .post<{ reference: string }>(`${this.apiUrl}/cash-out`, request)
      .pipe(
        map(({ reference }) => ({
          successful: true,
          reference,
          amount: request.amount,
          message: 'Cash-out request sent to African Bank.'
        })),
        catchError(({ error }) =>
          of({
            successful: false,
            reference: '',
            amount: request.amount,
            message: error?.message ?? 'The cash-out request could not be completed.'
          })
        )
      );
  }

  transferMemberToMember(
    request: MemberWalletTransferRequest
  ): Observable<WalletOperationResult> {
    return this.http
      .post<{ reference: string; recipientName: string }>(
        `${this.apiUrl}/transfer`,
        {
          recipientTelephoneNumber: request.recipientTelephoneNumber,
          amount: request.amount,
          paymentReference: request.paymentReference
        }
      )
      .pipe(
        map(({ reference, recipientName }) => ({
          successful: true,
          reference,
          amount: request.amount,
          recipientName,
          message: 'Member wallet transfer completed.'
        })),
        catchError(({ error }) =>
          of({
            successful: false,
            reference: '',
            amount: request.amount,
            message:
              error?.message ??
              'No Inkolo Connect member wallet was found for that cellphone number.'
          })
        )
      );
  }

  checkWalletBalance(userId: string, amount: number): Observable<boolean> {
    const wallet = this.findWallet('MEMBER', userId);
    return of(Boolean(wallet && wallet.balance >= amount));
  }

  debitWallet(userId: string, amount: number, reference: string): Observable<boolean> {
    const wallet = this.findWallet('MEMBER', userId);
    if (!wallet || amount <= 0 || wallet.balance < amount) {
      return of(false);
    }
    wallet.balance -= amount;
    wallet.availableBalance = Math.max(0, wallet.availableBalance - amount);
    this.recordWalletTransaction({
      id: `wallet-tx-${Date.now()}`,
      walletId: wallet.id,
      transactionType: 'ADJUSTMENT',
      amount,
      direction: 'OUT',
      description: reference,
      memberId: userId,
      reference,
      status: 'SUCCESSFUL',
      createdAt: new Date().toISOString()
    });
    return of(true);
  }

  creditWallet(userId: string, amount: number, reference: string): Observable<boolean> {
    const wallet = this.findWallet('MEMBER', userId);
    if (!wallet || amount <= 0) {
      return of(false);
    }
    wallet.balance += amount;
    wallet.availableBalance += amount;
    this.recordWalletTransaction({
      id: `wallet-tx-${Date.now()}`,
      walletId: wallet.id,
      transactionType: 'ADJUSTMENT',
      amount,
      direction: 'IN',
      description: reference,
      memberId: userId,
      reference,
      status: 'SUCCESSFUL',
      createdAt: new Date().toISOString()
    });
    return of(true);
  }

  recordWalletTransaction(transaction: WalletTransaction): Observable<WalletTransaction> {
    this.transactions.push(transaction);
    return of(transaction);
  }

  private findWallet(ownerType: WalletOwnerType, ownerId: string): Wallet | undefined {
    return this.wallets.find(
      (wallet) => wallet.ownerType === ownerType && wallet.ownerId === ownerId
    );
  }

  private normalizeTelephone(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.startsWith('27') && digits.length === 11
      ? `0${digits.slice(2)}`
      : digits;
  }

  private wallet(
    id: string,
    ownerType: WalletOwnerType,
    ownerId: string,
    walletName: string,
    balance: number
  ): Wallet {
    return {
      id,
      ownerType,
      ownerId,
      walletName,
      balance,
      availableBalance: balance * 0.9,
      pendingBalance: balance * 0.1,
      currency: 'ZAR',
      status: 'ACTIVE'
    };
  }

  private transaction(
    id: string,
    walletId: string,
    transactionType: WalletTransaction['transactionType'],
    amount: number,
    description: string
  ): WalletTransaction {
    return {
      id,
      walletId,
      transactionType,
      amount,
      direction: 'IN',
      description,
      reference: `KZNCC-${id.toUpperCase()}`,
      status: 'SUCCESSFUL',
      createdAt: new Date().toISOString()
    };
  }
}
