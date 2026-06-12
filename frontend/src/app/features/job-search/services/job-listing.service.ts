import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  JobListing,
  JobSearchFilters,
  JobStatus
} from '../models/job-search.model';

@Injectable({ providedIn: 'root' })
export class JobListingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/platform/jobs';

  getJobListings(): Observable<JobListing[]> {
    return this.http.get<JobListing[]>(this.apiUrl);
  }

  searchJobs(filters: JobSearchFilters): Observable<JobListing[]> {
    return this.getJobListings().pipe(
      map((jobs) =>
        jobs.filter((job) => {
          const query = filters.query?.trim().toLowerCase();
          const community = filters.community?.trim().toLowerCase();
          return (
            (!query ||
              job.title.toLowerCase().includes(query) ||
              job.description.toLowerCase().includes(query)) &&
            (!filters.area || job.area === filters.area) &&
            (!filters.category || job.category === filters.category) &&
            (!filters.employmentType || job.employmentType === filters.employmentType) &&
            (!filters.workMode || job.workMode === filters.workMode) &&
            (!filters.minPayment || (job.paymentAmount ?? 0) >= filters.minPayment) &&
            (!filters.maxPayment || (job.paymentAmount ?? 0) <= filters.maxPayment) &&
            (!community ||
              [job.listedByCommunityName, job.listedByChurchName, job.listedByBranchName]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(community))) &&
            (!filters.minimumRating || (job.listerRating ?? 0) >= filters.minimumRating) &&
            (!filters.status || job.status === filters.status)
          );
        })
      )
    );
  }

  getJobById(jobId: string): Observable<JobListing | undefined> {
    return this.getJobListings().pipe(
      map((jobs) => jobs.find(({ id }) => id === jobId))
    );
  }

  createJobListing(job: Omit<JobListing, 'id' | 'createdAt'>): Observable<JobListing> {
    return this.http.post<JobListing>(this.apiUrl, job);
  }

  updateJobListing(jobId: string, updates: Partial<JobListing>): Observable<JobListing | undefined> {
    return this.http.patch<JobListing>(`${this.apiUrl}/${jobId}`, updates);
  }

  updateJobStatus(jobId: string, status: JobStatus): Observable<JobListing | undefined> {
    return this.updateJobListing(jobId, { status });
  }

  getJobsListedByUser(userId: string): Observable<JobListing[]> {
    return this.getJobListings().pipe(
      map((jobs) => jobs.filter(({ listedByUserId }) => listedByUserId === userId))
    );
  }

  getMyJobListings(userId: string): Observable<JobListing[]> {
    return this.getJobsListedByUser(userId);
  }
}
