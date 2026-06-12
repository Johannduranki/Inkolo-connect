import { Injectable, inject } from '@angular/core';
import { JobListingService } from './job-listing.service';

@Injectable({ providedIn: 'root' })
export class JobSearchService {
  private readonly listings = inject(JobListingService);
  getJobListings = this.listings.getJobListings.bind(this.listings);
  searchJobs = this.listings.searchJobs.bind(this.listings);
  getJobById = this.listings.getJobById.bind(this.listings);
}
