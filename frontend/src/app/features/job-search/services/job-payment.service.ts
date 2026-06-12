import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { JobPaymentRequest } from '../models/job-search.model';
import { JobChatService } from './job-chat.service';

@Injectable({ providedIn: 'root' })
export class JobPaymentService {
  private readonly chats = inject(JobChatService);
  private readonly requests: JobPaymentRequest[] = [];
  private readonly balances = new Map<string, number>([['1', 850], ['2', 1200], ['3', 2400], ['4', 950]]);

  getPaymentRequests(conversationId: string): Observable<JobPaymentRequest[]> {
    return of(this.requests.filter((request) => request.conversationId === conversationId));
  }

  sendPaymentRequest(
    conversationId: string,
    request: Omit<JobPaymentRequest, 'id' | 'conversationId' | 'status' | 'createdAt'>
  ): Observable<JobPaymentRequest> {
    const created = {
      ...request,
      id: `job-payreq-${Date.now()}`,
      conversationId,
      status: 'PENDING' as const,
      createdAt: new Date().toISOString()
    };
    this.requests.push(created);
    this.chats.sendJobChatMessage(conversationId, {
      senderUserId: request.requestedByUserId,
      messageType: 'PAYMENT_REQUEST',
      messageText: request.description,
      paymentRequestId: created.id
    }).subscribe();
    return of(created);
  }

  declinePaymentRequest(id: string, userId: string): Observable<boolean> {
    const request = this.requests.find((item) => item.id === id && item.requestedFromUserId === userId);
    if (!request) return of(false);
    request.status = 'DECLINED';
    return of(true);
  }

  payJobPaymentRequest(id: string, payerUserId: string): Observable<JobPaymentRequest> {
    const request = this.requests.find((item) => item.id === id);
    if (!request || request.status !== 'PENDING' || request.requestedFromUserId !== payerUserId) {
      return throwError(() => new Error('This job payment request cannot be paid.'));
    }
    if (!this.checkWalletBalance(payerUserId, request.requestedAmount)) {
      return throwError(() => new Error('Insufficient wallet balance. Please top up your wallet to complete this payment.'));
    }
    this.transferWalletToWallet(payerUserId, request.requestedByUserId, request.requestedAmount, request.description);
    request.status = 'PAID';
    request.paidAt = new Date().toISOString();
    this.chats.sendJobChatMessage(request.conversationId, {
      senderUserId: payerUserId,
      messageType: 'PAYMENT_CONFIRMATION',
      messageText: `Job payment of R${request.requestedAmount.toFixed(2)} completed.`,
      paymentRequestId: request.id
    }).subscribe();
    return of(request);
  }

  markPaymentRequestAsPaid(id: string): Observable<boolean> {
    const request = this.requests.find((item) => item.id === id);
    if (!request) return of(false);
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
  transferWalletToWallet(payerUserId: string, receiverUserId: string, amount: number, reference: string): void {
    this.debitWallet(payerUserId, amount, reference);
    this.creditWallet(receiverUserId, amount, reference);
  }
}
