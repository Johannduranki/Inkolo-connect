export interface KznccAdminMessage {
  id: number;
  title: string;
  category: string;
  body: string;
  targetAudience: string;
  priority: 'Normal' | 'Important' | 'Urgent';
  status: 'Sent' | 'Draft';
  createdAt: string;
}
