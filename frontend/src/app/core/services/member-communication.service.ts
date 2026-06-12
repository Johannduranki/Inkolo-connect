import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CommunityMemberContact {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  telephoneNumber: string;
  email: string | null;
  roles: string[];
}

export interface DirectMemberMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  recipientUserId: string;
  text: string;
  sentAt: string;
}

@Injectable({ providedIn: 'root' })
export class MemberCommunicationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/community';

  searchMembers(query: string): Observable<CommunityMemberContact[]> {
    return this.http.get<CommunityMemberContact[]>(`${this.apiUrl}/members`, {
      params: new HttpParams().set('query', query)
    });
  }

  getContacts(): Observable<CommunityMemberContact[]> {
    return this.http.get<CommunityMemberContact[]>(`${this.apiUrl}/contacts`);
  }

  addContact(contactUserId: number): Observable<CommunityMemberContact> {
    return this.http.post<CommunityMemberContact>(`${this.apiUrl}/contacts`, {
      contactUserId
    });
  }

  getConversation(otherUserId: number): Observable<DirectMemberMessage[]> {
    return this.http.get<DirectMemberMessage[]>(
      `${this.apiUrl}/conversations/${otherUserId}`
    );
  }

  sendMessage(
    otherUserId: number,
    text: string
  ): Observable<DirectMemberMessage> {
    return this.http.post<DirectMemberMessage>(
      `${this.apiUrl}/conversations/${otherUserId}`,
      { text }
    );
  }
}

