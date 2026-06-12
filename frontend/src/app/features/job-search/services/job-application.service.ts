import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { JobApplication } from '../models/job-search.model';

@Injectable({ providedIn: 'root' })
export class JobApplicationService {
  private readonly applications: JobApplication[] = [];

  applyForJob(
    jobId: string,
    applicantUserId: string,
    applicationData: Pick<JobApplication, 'applicantName' | 'shortMessage' | 'cvDocumentId'>
  ): Observable<JobApplication> {
    const application: JobApplication = {
      ...applicationData,
      id: `application-${Date.now()}`,
      jobId,
      applicantUserId,
      status: 'SUBMITTED',
      createdAt: new Date().toISOString()
    };
    this.applications.push(application);
    return of(application);
  }

  getApplicationsForJob(jobId: string, listerOwnsJob: boolean): Observable<JobApplication[]> {
    return of(listerOwnsJob ? this.applications.filter((item) => item.jobId === jobId) : []);
  }

  getApplicationsByApplicant(applicantUserId: string): Observable<JobApplication[]> {
    return of(this.applications.filter((item) => item.applicantUserId === applicantUserId));
  }

  updateApplicationStatus(
    applicationId: string,
    status: JobApplication['status']
  ): Observable<JobApplication | undefined> {
    const application = this.applications.find(({ id }) => id === applicationId);
    if (application) {
      application.status = status;
      application.updatedAt = new Date().toISOString();
    }
    return of(application);
  }

  withdrawApplication(applicationId: string, applicantUserId: string): Observable<boolean> {
    const application = this.applications.find(
      ({ id, applicantUserId: ownerId }) => id === applicationId && ownerId === applicantUserId
    );
    if (!application) return of(false);
    application.status = 'WITHDRAWN';
    application.updatedAt = new Date().toISOString();
    return of(true);
  }
}
