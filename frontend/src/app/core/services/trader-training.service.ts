import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TraderTrainingAttempt {
  attemptNumber: number;
  answers: Record<string, string>;
  practicalExerciseAnswers?: Record<string, string | number>;
  trainingContentViewed?: boolean;
  score: number;
  passed: boolean;
  timeTaken?: string;
  attemptedAt: string;
}

export interface TraderTrainingPayment {
  fundingAmount: number;
  paymentStatus: string;
  paymentReference: string;
  walletTransactionId?: string;
  paymentDate?: string;
}

export interface TraderTrainingQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer?: string;
  explanation?: string;
}

export interface TraderTrainingModuleDashboard {
  id: string;
  sequence: number;
  moduleName: string;
  moduleDescription: string;
  trainingContent: string;
  practicalExerciseTitle?: string;
  practicalExerciseFields?: string[];
  practicalExerciseCalculation?: string;
  requiredPassPercentage: number;
  fundingAmount: number;
  status: 'Locked' | 'Available' | 'In Progress' | 'Completed';
  fundingStatus: 'Locked' | 'Eligible' | 'Approved' | 'Payment Processing' | 'Paid';
  nextModuleUnlocked: boolean;
  dateStarted?: string | null;
  dateCompleted?: string | null;
  trainingContentViewed?: boolean;
  practicalExerciseAnswers?: Record<string, string | number> | null;
  estimatedDuration?: string;
  questions: TraderTrainingQuestion[];
  attempts: TraderTrainingAttempt[];
  payment: TraderTrainingPayment | null;
}

export interface TraderTrainingProgrammeDashboard {
  id: string;
  tenantId: string;
  communityId: string;
  programmeName: string;
  programmeDescription: string;
  fundingOrganisation: string;
  totalGrantAmount: number;
  receivedAmount: number;
  remainingAmount: number;
  completedModules: number;
  progressPercentage: number;
  currentModuleName: string;
  programmeStatus: string;
  defaultPassPercentage: number;
  unlockRule: string;
  paymentRule: string;
  initialFundingOnApproval: boolean;
  initialFundingAmount: number;
  maximumBeneficiaries: number;
  application?: {
    status: string;
    submittedAt: string;
    reviewedAt?: string;
  } | null;
  modules: TraderTrainingModuleDashboard[];
}

@Injectable({ providedIn: 'root' })
export class TraderTrainingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/trader-training';

  getMyTraining(): Observable<TraderTrainingProgrammeDashboard[]> {
    return this.http.get<TraderTrainingProgrammeDashboard[]>(`${this.apiUrl}/me`);
  }

  submitQuizAttempt(
    programmeId: string,
    moduleId: string,
    answers: Record<string, string>,
    timeTaken = 'Member dashboard',
    practicalExerciseAnswers: Record<string, string | number> = {}
  ): Observable<{
    attempt: TraderTrainingAttempt;
    payment: TraderTrainingPayment | null;
    dashboard: TraderTrainingProgrammeDashboard;
  }> {
    return this.http.post<{
      attempt: TraderTrainingAttempt;
      payment: TraderTrainingPayment | null;
      dashboard: TraderTrainingProgrammeDashboard;
    }>(`${this.apiUrl}/programmes/${programmeId}/modules/${moduleId}/attempts`, {
      answers,
      timeTaken,
      practicalExerciseAnswers,
      trainingContentViewed: true
    });
  }
}
