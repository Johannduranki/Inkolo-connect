export interface KznccAdminEvent {
  id: number;
  title: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  host: string;
  targetAudience: string;
  rsvpRequired: boolean;
  maximumAttendees?: number;
  status: 'Published' | 'Draft';
}
