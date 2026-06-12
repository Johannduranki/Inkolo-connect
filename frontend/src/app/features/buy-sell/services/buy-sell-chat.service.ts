import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  BuySellChatConversation,
  BuySellChatMessage
} from '../models/buy-sell.model';

@Injectable({ providedIn: 'root' })
export class BuySellChatService {
  private readonly conversations: BuySellChatConversation[] = [];
  private readonly messages: BuySellChatMessage[] = [];

  startChatForListing(
    listingId: string,
    buyerUserId: string,
    sellerUserId: string
  ): Observable<BuySellChatConversation> {
    let conversation = this.conversations.find(
      (item) =>
        item.listingId === listingId &&
        item.buyerUserId === buyerUserId &&
        item.sellerUserId === sellerUserId
    );
    if (!conversation) {
      conversation = {
        id: `conversation-${Date.now()}`,
        listingId,
        buyerUserId,
        sellerUserId,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE'
      };
      this.conversations.push(conversation);
    }
    return of(conversation);
  }

  getBuySellChatConversation(
    conversationId: string,
    userId: string
  ): Observable<BuySellChatConversation | undefined> {
    return of(
      this.conversations.find(
        (conversation) =>
          conversation.id === conversationId &&
          [conversation.buyerUserId, conversation.sellerUserId].includes(userId)
      )
    );
  }

  getMessagesForConversation(
    conversationId: string,
    userId: string
  ): Observable<BuySellChatMessage[]> {
    const allowed = this.conversations.some(
      (conversation) =>
        conversation.id === conversationId &&
        [conversation.buyerUserId, conversation.sellerUserId].includes(userId)
    );
    return of(
      allowed
        ? this.messages.filter((message) => message.conversationId === conversationId)
        : []
    );
  }

  sendBuySellChatMessage(
    conversationId: string,
    message: Omit<BuySellChatMessage, 'id' | 'conversationId' | 'createdAt'>
  ): Observable<BuySellChatMessage> {
    const conversation = this.conversations.find(({ id }) => id === conversationId);
    if (
      !conversation ||
      ![conversation.buyerUserId, conversation.sellerUserId].includes(
        message.senderUserId
      )
    ) {
      throw new Error('You do not have access to this conversation.');
    }
    const created: BuySellChatMessage = {
      ...message,
      id: `message-${Date.now()}`,
      conversationId,
      createdAt: new Date().toISOString()
    };
    this.messages.push(created);
    return of(created);
  }
}
