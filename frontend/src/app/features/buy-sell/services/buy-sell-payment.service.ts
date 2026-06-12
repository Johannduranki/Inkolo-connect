import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import {
  BuySellPaymentRequest,
  BuySellWalletTransaction
} from '../models/buy-sell.model';
import { BuySellChatService } from './buy-sell-chat.service';

@Injectable({ providedIn: 'root' })
export class BuySellPaymentService {
  private readonly chats = inject(BuySellChatService);
  private readonly requests: BuySellPaymentRequest[] = [];
  private readonly transactions: BuySellWalletTransaction[] = [];
  private readonly balances = new Map<string, number>([
    ['1', 850],
    ['2', 1200],
    ['3', 2400],
    ['4', 950]
  ]);

  getPaymentRequests(conversationId: string): Observable<BuySellPaymentRequest[]> {
    return of(this.requests.filter((request) => request.conversationId === conversationId));
  }

  sendPaymentRequest(
    conversationId: string,
    paymentRequest: Omit<BuySellPaymentRequest, 'id' | 'conversationId' | 'status' | 'createdAt'>
  ): Observable<BuySellPaymentRequest> {
    const created: BuySellPaymentRequest = {
      ...paymentRequest,
      id: `payreq-${Date.now()}`,
      conversationId,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    this.requests.push(created);
    this.chats.sendBuySellChatMessage(conversationId, {
      senderUserId: paymentRequest.requestedByUserId,
      messageType: 'PAYMENT_REQUEST',
      messageText: paymentRequest.description,
      paymentRequestId: created.id
    }).subscribe();
    return of(created);
  }

  declinePaymentRequest(paymentRequestId: string, buyerUserId: string): Observable<boolean> {
    const request = this.requests.find(({ id }) => id === paymentRequestId);
    if (!request || request.requestedFromUserId !== buyerUserId) {
      return of(false);
    }
    request.status = 'DECLINED';
    return of(true);
  }

  payBuySellPaymentRequest(
    paymentRequestId: string,
    buyerUserId: string
  ): Observable<BuySellWalletTransaction> {
    const request = this.requests.find(({ id }) => id === paymentRequestId);
    if (
      !request ||
      request.status !== 'PENDING' ||
      request.requestedFromUserId !== buyerUserId
    ) {
      return throwError(() => new Error('This payment request cannot be paid.'));
    }
    if (!this.checkWalletBalance(buyerUserId, request.requestedAmount)) {
      return throwError(
        () =>
          new Error(
            'Insufficient wallet balance. Please top up your wallet to complete this payment.'
          )
      );
    }

    this.transferWalletToWallet(
      buyerUserId,
      request.requestedByUserId,
      request.requestedAmount,
      request.description
    );
    request.status = 'PAID';
    request.paidAt = new Date().toISOString();
    const transaction: BuySellWalletTransaction = {
      buyerWalletId: `wallet-${buyerUserId}`,
      sellerWalletId: `wallet-${request.requestedByUserId}`,
      listingId: request.listingId,
      paymentRequestId: request.id,
      amount: request.requestedAmount,
      reference: request.description,
      status: 'COMPLETED',
      type: 'BUY_SELL_PAYMENT',
      createdAt: request.paidAt
    };
    this.transactions.push(transaction);
    this.chats.sendBuySellChatMessage(request.conversationId, {
      senderUserId: buyerUserId,
      messageType: 'PAYMENT_CONFIRMATION',
      messageText: `Wallet payment of R${request.requestedAmount.toFixed(2)} completed.`,
      paymentRequestId: request.id
    }).subscribe();
    return of(transaction);
  }

  markPaymentRequestAsPaid(paymentRequestId: string): Observable<boolean> {
    const request = this.requests.find(({ id }) => id === paymentRequestId);
    if (!request) {
      return of(false);
    }
    request.status = 'PAID';
    request.paidAt = new Date().toISOString();
    return of(true);
  }

  checkWalletBalance(userId: string, amount: number): boolean {
    return (this.balances.get(userId) ?? 0) >= amount;
  }

  debitWallet(userId: string, amount: number, _reference: string): void {
    this.balances.set(userId, (this.balances.get(userId) ?? 0) - amount);
  }

  creditWallet(userId: string, amount: number, _reference: string): void {
    this.balances.set(userId, (this.balances.get(userId) ?? 0) + amount);
  }

  transferWalletToWallet(
    buyerUserId: string,
    sellerUserId: string,
    amount: number,
    reference: string
  ): void {
    this.debitWallet(buyerUserId, amount, reference);
    this.creditWallet(sellerUserId, amount, reference);
  }
}
