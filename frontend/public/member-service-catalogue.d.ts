export const memberCapabilities: Record<string,{native?:string;issue?:string;detail?:string;route?:string}>;
export function reconcileMemberCatalogue(existing:any[],rows:any[],loaded?:boolean,context?:any):any[];
export function enabledMemberService(service:any,configuration:any):boolean;
export function scopedMemberCatalogue(services:any[],configuration:any):any[];
export function programmeContext(data:any,communityId:any):any;
