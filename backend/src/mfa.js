export const needsMfa = user => !!user && (user.roles || []).some(role => !['member','community_member','community member'].includes(String(role).toLowerCase()));

export { MysqlMfaStore as MfaStore } from './mysql-auth-store.js';
