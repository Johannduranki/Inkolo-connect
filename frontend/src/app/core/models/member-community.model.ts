export interface Church {
  id: string;
  name: string;
  denomination?: string;
  region?: string;
  province?: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

export interface ChurchBranch {
  id: string;
  churchId: string;
  branchName: string;
  branchCode?: string;
  pastorName?: string;
  region?: string;
  province?: string;
  physicalAddress?: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

export interface MemberCommunity {
  memberId: string;
  churchId: string;
  churchName: string;
  branchId?: string;
  branchName?: string;
}
