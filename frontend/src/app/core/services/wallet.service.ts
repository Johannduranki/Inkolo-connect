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
  private readonly memberDirectory = new Map<string, string>([]);
  private readonly wallets: Wallet[] = [];
  private readonly transactions: WalletTransaction[] = [];

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

  getChurchWalletSummary(churchId: string): Observable<ChurchWalletSummary> {return new Observable(subscriber=>subscriber.error(new Error('This function requires a connected, reconciled financial ledger.')));}

  getBishopWalletSummary(bishopId: string): Observable<BishopWalletSummary> {return new Observable(subscriber=>subscriber.error(new Error('This function requires a connected, reconciled financial ledger.')));}

  getKznccRevenueWalletSummary(kznccId: string): Observable<KznccWalletSummary> {return new Observable(subscriber=>subscriber.error(new Error('This function requires a connected, reconciled financial ledger.')));}

  payTithe(memberId: string, churchId: string, amount: number): Observable<boolean> {return new Observable(subscriber=>subscriber.error(new Error('This function requires a connected, reconciled financial ledger.')));}

  payOffering(memberId: string, churchId: string, amount: number): Observable<boolean> {
    return this.payTithe(memberId, churchId, amount);
  }

  requestWalletPayout(walletId: string, amount: number): Observable<boolean> {return new Observable(subscriber=>subscriber.error(new Error('This function requires a connected, reconciled financial ledger.')));}

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
              'No Duranki member wallet was found for that cellphone number.'
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
