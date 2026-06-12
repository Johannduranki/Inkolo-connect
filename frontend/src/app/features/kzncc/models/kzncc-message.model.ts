export type KznccMessageType =
  | 'General notice'
  | 'Church update'
  | 'Important alert'
  | 'Member information'
  | 'Service update';

export interface KznccMessage {
  id: number;
  title: string;
  senderName: string;
  dateTime: string;
  type: KznccMessageType;
  body: string;
}
