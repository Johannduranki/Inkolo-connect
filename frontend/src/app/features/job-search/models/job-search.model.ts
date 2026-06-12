export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'PERMANENT'
  | 'TEMPORARY'
  | 'CONTRACT'
  | 'ONCE_OFF';
export type JobStatus = 'OPEN' | 'IN_PROGRESS' | 'FILLED' | 'COMPLETED' | 'CANCELLED';

export interface JobListing {
  id: string;
  title: string;
  description: string;
  category: string;
  jobType: string;
  employmentType: EmploymentType;
  workMode?: 'REMOTE' | 'ON_SITE' | 'HYBRID';
  area: string;
  paymentAmount?: number;
  paymentFrequency?: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONCE_OFF';
  requiredSkills?: string[];
  experienceRequired?: string;
  startDate?: string;
  closingDate?: string;
  numberOfPositions?: number;
  listedByUserId: string;
  listedByUserName: string;
  listedByCommunityName?: string;
  listedByChurchName?: string;
  listedByBranchName?: string;
  listerRating?: number;
  status: JobStatus;
  createdAt: string;
}

export interface JobSearchFilters {
  query?: string;
  area?: string;
  category?: string;
  employmentType?: EmploymentType | '';
  workMode?: JobListing['workMode'] | '';
  minPayment?: number;
  maxPayment?: number;
  community?: string;
  minimumRating?: number;
  status?: JobStatus | '';
}

export interface JobApplication {
  id: string;
  jobId: string;
  applicantUserId: string;
  applicantName: string;
  shortMessage?: string;
  cvDocumentId?: string;
  status:
    | 'SUBMITTED'
    | 'VIEWED'
    | 'SHORTLISTED'
    | 'INTERVIEW_REQUESTED'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'WITHDRAWN';
  createdAt: string;
  updatedAt?: string;
}

export interface JobChatConversation {
  id: string;
  jobId: string;
  applicantUserId: string;
  listerUserId: string;
  createdAt: string;
  status: 'ACTIVE' | 'CLOSED';
}

export interface JobChatMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  messageType:
    | 'TEXT'
    | 'APPLICATION'
    | 'INTERVIEW_REQUEST'
    | 'PAYMENT_REQUEST'
    | 'PAYMENT_CONFIRMATION'
    | 'JOB_STATUS';
  messageText?: string;
  applicationId?: string;
  paymentRequestId?: string;
  createdAt: string;
}

export interface JobPaymentRequest {
  id: string;
  jobId: string;
  conversationId: string;
  requestedByUserId: string;
  requestedFromUserId: string;
  requestedAmount: number;
  description: string;
  status: 'PENDING' | 'PAID' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  paidAt?: string;
}
