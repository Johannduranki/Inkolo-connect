export interface KznccEvent {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  status: 'Open' | 'Limited space' | 'Registration soon';
}
