import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { JobChatConversation, JobChatMessage } from '../models/job-search.model';

@Injectable({ providedIn: 'root' })
export class JobChatService {
  private readonly conversations: JobChatConversation[] = [];
  private readonly messages: JobChatMessage[] = [];

  startChatForJob(jobId: string, applicantUserId: string, listerUserId: string): Observable<JobChatConversation> {
    let conversation = this.conversations.find(
      (item) => item.jobId === jobId && item.applicantUserId === applicantUserId
    );
    if (!conversation) {
      conversation = {
        id: `job-conversation-${Date.now()}`,
        jobId,
        applicantUserId,
        listerUserId,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE'
      };
      this.conversations.push(conversation);
    }
    return of(conversation);
  }

  getJobChatConversation(id: string, userId: string): Observable<JobChatConversation | undefined> {
    return of(this.conversations.find(
      (item) => item.id === id && [item.applicantUserId, item.listerUserId].includes(userId)
    ));
  }

  getMessagesForConversation(id: string, userId: string): Observable<JobChatMessage[]> {
    const allowed = this.conversations.some(
      (item) => item.id === id && [item.applicantUserId, item.listerUserId].includes(userId)
    );
    return of(allowed ? this.messages.filter((message) => message.conversationId === id) : []);
  }

  sendJobChatMessage(
    conversationId: string,
    message: Omit<JobChatMessage, 'id' | 'conversationId' | 'createdAt'>
  ): Observable<JobChatMessage> {
    const conversation = this.conversations.find(({ id }) => id === conversationId);
    if (!conversation || ![conversation.applicantUserId, conversation.listerUserId].includes(message.senderUserId)) {
      throw new Error('You do not have access to this job conversation.');
    }
    const created = {
      ...message,
      id: `job-message-${Date.now()}`,
      conversationId,
      createdAt: new Date().toISOString()
    };
    this.messages.push(created);
    return of(created);
  }

  sendInterviewRequest(
    conversationId: string,
    applicationId: string,
    message: string,
    senderUserId: string
  ): Observable<JobChatMessage> {
    return this.sendJobChatMessage(conversationId, {
      senderUserId,
      messageType: 'INTERVIEW_REQUEST',
      messageText: message,
      applicationId
    });
  }
}
