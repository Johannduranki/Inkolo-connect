import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BuySellChatConversation,
  BuySellChatMessage
} from '../models/buy-sell.model';

@Injectable({ providedIn: 'root' })
export class BuySellChatService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/marketplace';

  startChatForListing(
    listingId: string,
    _buyerUserId: string,
    _sellerUserId: string
  ): Observable<BuySellChatConversation> {
    return this.http.post<BuySellChatConversation>(
      `${this.apiUrl}/listings/${listingId}/conversations`,
      {}
    );
  }

  getMyConversations(): Observable<BuySellChatConversation[]> {
    return this.http.get<BuySellChatConversation[]>(
      `${this.apiUrl}/conversations`
    );
  }

  getBuySellChatConversation(
    conversationId: string,
    _userId: string
  ): Observable<BuySellChatConversation | undefined> {
    return this.http.get<BuySellChatConversation>(
      `${this.apiUrl}/conversations/${conversationId}`
    );
  }

  getMessagesForConversation(
    conversationId: string,
    _userId: string
  ): Observable<BuySellChatMessage[]> {
    return this.http.get<BuySellChatMessage[]>(
      `${this.apiUrl}/conversations/${conversationId}/messages`
    );
  }

  sendBuySellChatMessage(
    conversationId: string,
    message: Omit<BuySellChatMessage, 'id' | 'conversationId' | 'createdAt'>
  ): Observable<BuySellChatMessage> {
    return this.http.post<BuySellChatMessage>(
      `${this.apiUrl}/conversations/${conversationId}/messages`,
      message
    );
  }
}
