import { Injectable } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { PaidServiceMember } from '../models/paid-service-member.model';
import { ServiceProvider } from '../models/service-provider.model';

export interface ServiceProviderDashboardSummary {
  provider: ServiceProvider;
  activePaidMembers: number;
  pendingMembers: number;
  cancelledMembers: number;
  monthlyPremiumValue: number;
  amountPayableToProvider: number;
  policiesUploaded: number;
  policiesOutstanding: number;
  nextBillingCycleDate: string;
}

@Injectable({ providedIn: 'root' })
export class ServiceProviderService {
  readonly provider: ServiceProvider = {
    id: 'sp-001',
    name: 'African Bank Funeral Cover',
    providerType: 'FUNERAL_COVER',
    contactPerson: 'Provider Administrator',
    email: 'provider@example.org',
    phone: '011 555 0199',
    status: 'ACTIVE'
  };
  private readonly members: PaidServiceMember[] = [
    this.member('mem-001', 'Nandi Mthembu', 'Grace Community Church', 'Family Funeral Cover', 99, 'PAID', 'ACTIVE', 'UPLOADED'),
    this.member('mem-002', 'Thabo Khumalo', 'Zion Revival Church', 'African Bank Funeral Cover', 99, 'PAID', 'ACTIVE', 'MISSING'),
    this.member('mem-003', 'Lerato Sithole', 'New Hope Christian Centre', 'Basic Funeral Cover', 75, 'DUE', 'PENDING', 'MISSING'),
    this.member('mem-004', 'Sibusiso Zulu', 'Durban Central Fellowship', 'Standard Funeral Cover', 110, 'FAILED', 'ACTIVE', 'UPLOADED'),
    this.member('mem-005', 'Ayanda Dlamini', 'Pietermaritzburg Worship Centre', 'Senior Funeral Cover', 85, 'PAID', 'ACTIVE', 'UPLOADED')
  ];

  getServiceProviderDashboardSummary(
    serviceProviderId: string
  ): Observable<ServiceProviderDashboardSummary> {
    return this.getPaidMembersByServiceProvider(serviceProviderId).pipe(
      map((members) => {
        const paid = members.filter(({ paymentStatus }) => paymentStatus === 'PAID');
        return {
          provider: this.provider,
          activePaidMembers: members.filter(({ policyStatus }) => policyStatus === 'ACTIVE').length,
          pendingMembers: members.filter(({ policyStatus }) => policyStatus === 'PENDING').length,
          cancelledMembers: members.filter(({ policyStatus }) =>
            ['CANCELLED', 'LAPSED'].includes(policyStatus)
          ).length,
          monthlyPremiumValue: paid.reduce((sum, item) => sum + item.monthlyPremium, 0),
          amountPayableToProvider: paid.reduce((sum, item) => sum + item.monthlyPremium * 0.73, 0),
          policiesUploaded: members.filter(({ policyDocumentStatus }) => policyDocumentStatus === 'UPLOADED').length,
          policiesOutstanding: members.filter(({ policyDocumentStatus }) => policyDocumentStatus === 'MISSING').length,
          nextBillingCycleDate: '2026-07-01'
        };
      })
    );
  }

  getPaidMembersByServiceProvider(serviceProviderId: string): Observable<PaidServiceMember[]> {
    return of(this.members.filter((member) => member.serviceProviderId === serviceProviderId));
  }

  getPaidMembersByService(
    serviceProviderId: string,
    serviceId: string
  ): Observable<PaidServiceMember[]> {
    return this.getPaidMembersByServiceProvider(serviceProviderId).pipe(
      map((members) => members.filter((member) => member.serviceId === serviceId))
    );
  }

  getPaidMembersByBillingCycle(
    serviceProviderId: string,
    billingCycleId: string
  ): Observable<PaidServiceMember[]> {
    return this.getPaidMembersByServiceProvider(serviceProviderId).pipe(
      map((members) => members.filter((member) => member.billingCycleId === billingCycleId))
    );
  }

  getFuneralCoverMembers(serviceProviderId: string): Observable<PaidServiceMember[]> {
    return this.getPaidMembersByService(serviceProviderId, 'funeral-cover-001');
  }

  canServiceProviderAccessMember(serviceProviderId: string, memberId: string): boolean {
    return this.members.some(
      (member) =>
        member.serviceProviderId === serviceProviderId && member.memberId === memberId
    );
  }

  private member(
    memberId: string,
    memberName: string,
    churchName: string,
    productName: string,
    monthlyPremium: number,
    paymentStatus: PaidServiceMember['paymentStatus'],
    policyStatus: PaidServiceMember['policyStatus'],
    policyDocumentStatus: PaidServiceMember['policyDocumentStatus']
  ): PaidServiceMember {
    return {
      id: `subscription-${memberId}`,
      memberId,
      memberName,
      memberProfileNumber: memberId.toUpperCase(),
      cellphone: '071 234 5678',
      email: `${memberName.toLowerCase().replace(' ', '.')}@example.org`,
      churchId: 'church-001',
      churchName,
      serviceProviderId: 'sp-001',
      serviceId: 'funeral-cover-001',
      serviceName: 'Funeral Cover',
      productName,
      planName: productName,
      monthlyPremium,
      coverAmount: 25000,
      policyNumber: policyDocumentStatus === 'UPLOADED' ? `POL-${memberId.toUpperCase()}` : undefined,
      policyStatus,
      lastPaymentDate: paymentStatus === 'PAID' ? '2026-06-01' : undefined,
      nextPaymentDueDate: '2026-07-01',
      billingCycleId: 'bc-2026-06',
      paymentStatus,
      policyDocumentStatus
    };
  }
}
